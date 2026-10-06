import { Array, DateTime, Effect, Match, Option, Stream, SynchronizedRef } from 'effect'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Result from 'effect/Result'
import type { Schema } from 'effect'
import { failureEnvelope } from './cloudflare-envelope.schema.js'
import type { EmulatorState, WriteCount } from './state/emulator-state.js'
import { FaultCommand } from './state/faults.schema.js'
import type { OperationFault } from './state/faults.schema.js'
import { judgeFault } from './state/judge-fault.workflow.js'

export interface Settled<S> {
  readonly product: S
  readonly status: number
  readonly body: Schema.Json
}

export interface SettleOptions<S> {
  readonly store: SynchronizedRef.SynchronizedRef<EmulatorState>
  readonly operation: string
  readonly isWrite: boolean
  readonly write: (state: EmulatorState, product: S) => EmulatorState
  readonly decide: (input: {
    readonly now: string
    readonly newId: string
    readonly state: EmulatorState
  }) => Settled<S>
}

const respond = (status: number, body: Schema.Json): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(body, { status })

const respondRetry = (
  status: number,
  retryAfterSeconds: number,
  body: Schema.Json,
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeader(respond(status, body), 'retry-after', String(retryAfterSeconds))

const respondReset = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.stream(Stream.fail(new Error('emulator: commit-then-reset')))

const injectedBody = (status: number): Schema.Json =>
  failureEnvelope({ code: status, message: `Injected ${status} fault.` })

const hiddenBody = (): Schema.Json =>
  failureEnvelope({ code: 10006, message: 'The object is not visible yet.' })

const nextId = (sequence: number): string => sequence.toString(16).padStart(32, '0')

const upsertWrite = (writes: ReadonlyArray<WriteCount>, operation: string): ReadonlyArray<WriteCount> =>
  Option.match(
    Array.findFirst(writes, (write) => write.operation === operation),
    {
      onNone: () => Array.append(writes, { operation, count: 1 }),
      onSome: (write) =>
        Array.map(writes, (candidate) =>
          Match.value(candidate.operation === operation).pipe(
            Match.when(true, () => ({ operation, count: write.count + 1 })),
            Match.when(false, () => candidate),
            Match.exhaustive,
          )),
    },
  )

const bumpWrites = (
  writes: ReadonlyArray<WriteCount>,
  operation: string,
  isWrite: boolean,
): ReadonlyArray<WriteCount> =>
  Match.value(isWrite).pipe(
    Match.when(true, () => upsertWrite(writes, operation)),
    Match.when(false, () => writes),
    Match.exhaustive,
  )

const refused = (
  state: EmulatorState,
  faults: ReadonlyArray<OperationFault>,
  response: HttpServerResponse.HttpServerResponse,
): readonly [HttpServerResponse.HttpServerResponse, EmulatorState] => [response, { ...state, faults }]

const applied = <S>(
  state: EmulatorState,
  faults: ReadonlyArray<OperationFault>,
  options: SettleOptions<S>,
  now: string,
  responder: (settled: Settled<S>) => HttpServerResponse.HttpServerResponse,
): readonly [HttpServerResponse.HttpServerResponse, EmulatorState] => {
  const settled = options.decide({ now, newId: nextId(state.sequence), state })
  const written = options.write(state, settled.product)
  const next: EmulatorState = {
    ...written,
    sequence: state.sequence + 1,
    faults,
    writes: bumpWrites(written.writes, options.operation, options.isWrite),
  }
  return [responder(settled), next]
}

export const settleOperation = <S>(options: SettleOptions<S>): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  SynchronizedRef.modify(options.store, (state) => {
    const verdict = Result.getOrThrow(
      judgeFault(FaultCommand.make({ operation: options.operation, isWrite: options.isWrite, faults: state.faults })),
    )
    const now = DateTime.formatIso(DateTime.nowUnsafe())
    return Match.value(verdict).pipe(
      Match.tags({
        FaultInject: (injected) =>
          refused(state, injected.faults, respondRetry(injected.status, injected.retryAfterSeconds, injectedBody(injected.status))),
        FaultHidden: (hidden) => refused(state, hidden.faults, respond(404, hiddenBody())),
        FaultReset: (reset) => applied(state, reset.faults, options, now, () => respondReset()),
        FaultProceed: (proceed) =>
          applied(state, proceed.faults, options, now, (settled) => respond(settled.status, settled.body)),
      }),
      Match.exhaustive,
    )
  })
