/// <reference types="vitest/import-meta" />
import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { DrawnCommand, drawnDecision, DrawnDecisionError } from './DrawnDecision.workflow.js'

/**
 * The phase bag the generated descriptions instantiate. `command` passes through the pure
 * phases untouched and the decision is `Success` unless a draw places a `Failure` — the two
 * error channels a `Failure` can inhabit are `number` (decode) and `DrawnDecisionError`
 * (decide), so a drawn failure carries a payload, while the read/write error and context
 * channels stay `never`, so no other failure is drawable. The properties this arbitrary
 * feeds are about order, response and failure routing, and the routing properties read
 * which phase drew the `Failure` off the drawn value.
 *
 * The payload types are this generator's own input choice, not a claim about the
 * description. `command`, `output` and `response` share `number`, and that sharing is what
 * lets a single `'effect'` run serve both effect phases.
 *
 * `raw` and `decoded` do not share: the decode phase is the one place this bag genuinely
 * converts, wrapping the drawn `number` into the `DrawnCommand` the decide phase reads
 * `value` back out of. So the `'either-fail'` run that serves decode is a real
 * construction, not the identity pass-through it once was — a description whose phases
 * disagree about a payload type is not merely expressible here, it is what this bag draws.
 */
export interface Bag extends Cell.Phases {
  readonly command: number
  readonly raw: number
  readonly decoded: DrawnCommand
  readonly decision: number
  readonly decisionError: DrawnDecisionError
  readonly output: number
  readonly response: number
  readonly decodeError: number
  readonly readError: never
  readonly writeError: never
}

const TEMPLATE = Cell.canonical.phases

/** The phases whose convention admits a `Failure`, walked rather than listed. */
const FAILABLE: readonly {
  readonly phaseIndex: number
  readonly convention: 'either-fail' | 'either-pass'
}[] = TEMPLATE.flatMap((phase, phaseIndex) =>
  phase.convention === 'either-fail' || phase.convention === 'either-pass'
    ? [{ phaseIndex, convention: phase.convention }]
    : []
)

const substituteSandwich = (
  trace: string[],
  writeObserved: number[],
  encodeObserved: Result.Result<number, DrawnDecisionError>[],
  response: number,
  failure: DrawnFailure | undefined,
): readonly Cell.Phase<Bag>[] => {
  const lastPhaseIndex = TEMPLATE.length - 1
  return TEMPLATE.map((phase, phaseIndex) => {
    const convention = phase.convention
    switch (convention) {
      case 'effect':
        return {
          ...phase,
          run: (input: number): Effect.Effect<number, never, never> =>
            Effect.sync(() => {
              trace.push(phase.name)
              if (phaseIndex === lastPhaseIndex) {
                writeObserved.push(input)
              }
              return response
            }),
        }
      case 'either-fail':
        return {
          ...phase,
          run: (input: number): Result.Result<DrawnCommand, number> => {
            trace.push(phase.name)
            if (failure !== undefined && failure.phaseIndex === phaseIndex) {
              return Result.fail(failure.error)
            }
            return Result.succeed(DrawnCommand.make({ value: input }))
          },
        }
      case 'either-pass': {
        const injection = failure !== undefined && failure.phaseIndex === phaseIndex
          ? { injected: true as const, error: failure.error }
          : { injected: false as const, error: 0 }
        return {
          ...phase,
          run: drawnDecision(trace, phase.name, injection),
        }
      }
      case 'total':
        return {
          ...phase,
          run: (outcome: Result.Result<number, DrawnDecisionError>): number => {
            trace.push(phase.name)
            encodeObserved.push(outcome)
            return Result.match(outcome, {
              onFailure: (error) => error.code,
              onSuccess: (decision) => decision,
            })
          },
        }
      default: {
        const unreachable: never = convention
        throw new Error(
          `effect-cell-gen: a phase with an unknown convention ${String(unreachable)} reached the generator`,
        )
      }
    }
  })
}

export interface DrawnFailure {
  readonly phaseIndex: number
  readonly name: string
  readonly convention: 'either-fail' | 'either-pass'
  readonly error: number
}

export interface DescriptionCase {
  readonly description: Cell.WriteDone<Bag>
  readonly command: number
  readonly trace: readonly string[]
  readonly writeObserved: readonly number[]
  readonly encodeObserved: readonly Result.Result<number, DrawnDecisionError>[]
  readonly failure: DrawnFailure | undefined
  readonly lastResponse: number
}

export const description: fc.Arbitrary<DescriptionCase> = fc
  .record({
    command: fc.integer(),
    writeResponse: fc.integer(),
  })
  .chain((drawn) => {
    const drawFailure = (): fc.Arbitrary<DrawnFailure> =>
      fc
        .record({
          failingIndex: fc.nat({ max: FAILABLE.length - 1 }),
          error: fc.oneof(fc.constant(-1), fc.integer()),
        })
        .map(({ failingIndex, error }) => {
          const chosen = FAILABLE[failingIndex]
          if (chosen === undefined) {
            throw new Error('effect-cell-gen: a drawn failing index had no matching phase')
          }
          const phase = TEMPLATE[chosen.phaseIndex]
          if (phase === undefined) {
            throw new Error('effect-cell-gen: a drawn phase index had no phase record')
          }
          return {
            phaseIndex: chosen.phaseIndex,
            name: phase.name,
            convention: chosen.convention,
            error,
          }
        })
    const maybeFailure: fc.Arbitrary<DrawnFailure | undefined> = FAILABLE.length === 0
      ? fc.constant(undefined)
      : fc.oneof(
        { arbitrary: drawFailure(), weight: 1 },
        { arbitrary: fc.constant(undefined), weight: 2 },
      )
    return maybeFailure.map((failure) => {
      const trace: string[] = []
      const writeObserved: number[] = []
      const encodeObserved: Result.Result<number, DrawnDecisionError>[] = []
      const built: Cell.WriteDone<Bag> = {
        ...Cell.canonical,
        phases: substituteSandwich(trace, writeObserved, encodeObserved, drawn.writeResponse, failure),
      }
      return {
        description: built,
        command: drawn.command,
        trace,
        writeObserved,
        encodeObserved,
        failure,
        lastResponse: drawn.writeResponse,
      }
    })
  })

const declaredOrderOf = (description: Cell.WriteDone<Bag>): readonly string[] =>
  description.phases.map((phase) => phase.name)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const Effect = await import('effect/Effect')
  const Result = await import('effect/Result')

  const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((entry, index) => entry === b[index])

  // An either-fail draw aborts before every phase runs, so its trace is an honest
  // prefix of the declared order; the order and response claims do not apply to it.
  it.effect.prop(
    '∀d_Phases_≡Declared',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        if (drawn.failure?.convention === 'either-fail') {
          return true
        }
        const declared = declaredOrderOf(drawn.description)
        yield* Cell.apply(drawn.description, drawn.command)
        return sameOrder(drawn.trace, declared)
      }),
  )

  it.effect.prop(
    '∀d_Response_=LastWrite',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        if (drawn.failure?.convention === 'either-fail') {
          return true
        }
        const response = yield* Cell.apply(drawn.description, drawn.command)
        return response === drawn.lastResponse
      }),
  )

  it.effect.prop(
    '∀d_FailureEitherFail_⊥Write',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        const failure = drawn.failure
        if (failure === undefined || failure.convention !== 'either-fail') {
          return true
        }
        const outcome = yield* Effect.result(Cell.apply(drawn.description, drawn.command))
        return (
          Result.isFailure(outcome) &&
          outcome.failure === failure.error &&
          drawn.writeObserved.length === 0
        )
      }),
  )

  it.effect.prop(
    '∀d_FailureEitherPass_=Payload',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        const failure = drawn.failure
        if (failure === undefined || failure.convention !== 'either-pass') {
          return true
        }
        const outcome = yield* Effect.result(Cell.apply(drawn.description, drawn.command))
        if (!Result.isSuccess(outcome)) {
          return false
        }
        const encodeObserved = drawn.encodeObserved[0]
        return (
          outcome.success === drawn.lastResponse &&
          encodeObserved !== undefined &&
          Result.isFailure(encodeObserved) &&
          encodeObserved.failure.code === failure.error &&
          drawn.writeObserved[0] === failure.error
        )
      }),
  )
}
