import { StackDestroyFailed, type StackLayerError } from '@systemfsoftware/alchemy-stack-layer'
import { Cause, Effect, Exit, Layer, Match, Option, Schema } from 'effect'
import { type Ledger, makeLedger } from './probe-stack.fixture.js'

export interface Outcome {
  readonly tag: string
  readonly stack?: string
  readonly stage?: string
  readonly message?: string
}

const isDestroyFailed = Schema.is(StackDestroyFailed)

const firstLine = (text: string): string => text.split('\n')[0] ?? ''

const located =
  (tag: string) => (error: { readonly stack: string; readonly stage: string; readonly message: string }): Outcome => ({
    tag,
    stack: error.stack,
    stage: error.stage,
    message: firstLine(error.message),
  })

const describeError = (error: StackLayerError): Outcome =>
  Match.valueTags(error, {
    StageUnresolved: (unresolved) => ({
      tag: 'StageUnresolved',
      stack: unresolved.stack,
      message: firstLine(unresolved.message),
    }),
    StackDeployFailed: located('StackDeployFailed'),
    StackDestroyFailed: located('StackDestroyFailed'),
    DurableStateRequired: located('DurableStateRequired'),
  })

const defectOutcome = <E>(cause: Cause.Cause<E>): Outcome => {
  const squashed = Cause.squash(cause)
  return isDestroyFailed(squashed) ? describeError(squashed) : { tag: Cause.pretty(cause) }
}

const failureOutcome = (cause: Cause.Cause<StackLayerError>): Outcome =>
  Option.match(Cause.findErrorOption(cause), { onNone: () => defectOutcome(cause), onSome: describeError })

export const outcomeOf = <A>(exit: Exit.Exit<A, StackLayerError>): Outcome =>
  Exit.isSuccess(exit) ? { tag: 'success' } : failureOutcome(exit.cause)

export const releasedExit = <A>(
  layer: Layer.Layer<A, StackLayerError>,
): Effect.Effect<Exit.Exit<void, StackLayerError>> => Effect.exit(Effect.scoped(Effect.asVoid(Layer.build(layer))))

export const opsOf = (ledger: Ledger): ReadonlyArray<string> => ledger.entries.map((entry) => `${entry.op} ${entry.id}`)

export interface LedgerRefusals {
  readonly refuseCreate?: ReadonlyArray<string>
  readonly refuseDelete?: boolean
}

export const freshLedger = ({ refuseCreate = [], refuseDelete = false }: LedgerRefusals = {}) =>
  Effect.sync(() => makeLedger({ refuseCreate: new Set(refuseCreate), refuseDelete }))

export const refusingDeletes = (ledger: Ledger): Ledger => ({
  ...ledger,
  behaviour: { ...ledger.behaviour, refuseDelete: true },
})

export interface StageCheck {
  readonly ledger: Ledger
  readonly stage: string
}

const deleteStagesOf = (ledger: Ledger): ReadonlyArray<string> =>
  ledger.entries.filter((entry) => entry.op === 'delete').map((entry) => entry.stage)

export const deletedOnlyAt = ({ ledger, stage }: StageCheck): Effect.Effect<void> =>
  Effect.suspend(() => {
    const deletes = deleteStagesOf(ledger)
    return deletes.length === 1 && deletes[0] === stage
      ? Effect.void
      : Effect.die(`expected one delete at ${stage}, saw ${deletes.join(', ')}`)
  })
