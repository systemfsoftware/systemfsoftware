import { Operations } from '@systemfsoftware/effect-contract'
import { DateTime, Effect, Match, Option, Result, Schema } from 'effect'
import { jsonCodecOf } from './operation-codec.js'
import { ArmOperation, BeginOperation, OperationMissing, SettleOperation } from './operation-store.schema.js'
import { runSettlementSinks, type SettlementSink } from './settlement-sink.js'

export type SqlValue = string | number | null | Uint8Array

export interface SqlCursorLike {
  readonly toArray: () => ReadonlyArray<Record<string, SqlValue>>
}

export interface SqlStorageLike {
  readonly exec: (query: string, ...bindings: ReadonlyArray<SqlValue>) => SqlCursorLike
}

export interface OperationStoreStorage {
  readonly sql: SqlStorageLike
  transactionSync: <T>(callback: () => T) => T
  setAlarm: (scheduledTime: number) => void
  getAlarm: () => number | null
}

export interface OperationIdLike {
  readonly name?: string | undefined
}

export interface OperationStoreCtx {
  readonly id: OperationIdLike
  readonly storage: OperationStoreStorage
  readonly waitUntil: (promise: Promise<void>) => void
}

export interface OperationStoreOptions {
  readonly ctx: OperationStoreCtx
  readonly sinks?: ReadonlyArray<SettlementSink>
}

export interface OperationStoreHandlers {
  readonly fetch: (request: Request) => Effect.Effect<Response>
  readonly alarm: Effect.Effect<void>
}

interface OperationWaiter {
  readonly push: (line: Uint8Array) => void
}

interface Settlement {
  readonly settled: Operations.Settled
  readonly committed: boolean
}

type StagedSettlement = Option.Option<Result.Result<Settlement, Operations.AlreadySettled>>
type SettlementFailure = OperationMissing | Operations.AlreadySettled

const NotFoundResponse = (): Response => new Response('no operation is recorded', { status: 404 })
const BadRequestResponse = (): Response =>
  new Response('the operation store request is not well formed', { status: 400 })
const RouteMissingResponse = (): Response => new Response('the operation store has no such route', { status: 404 })

const jsonOf = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } })

const textOf = (request: Request): Effect.Effect<string> => Effect.promise(() => request.text())

const decodeWith = <A>(
  decode: (text: string) => Result.Result<A, Schema.SchemaError>,
): (request: Request) => Effect.Effect<A, Response> =>
(request) =>
  Effect.flatMap(textOf(request), (text) =>
    Result.match(decode(text), {
      onFailure: () => Effect.fail(BadRequestResponse()),
      onSuccess: (value) => Effect.succeed(value),
    }))

const decodeBegin = decodeWith((text) => Schema.decodeResult(jsonCodecOf(BeginOperation))(text))
const decodeArm = decodeWith((text) => Schema.decodeResult(jsonCodecOf(ArmOperation))(text))
const decodeSettle = decodeWith((text) => Schema.decodeResult(jsonCodecOf(SettleOperation))(text))

const encodeState = (state: Operations.OperationState): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(Operations.OperationState))(state))

const encodeSettled = (settled: Operations.Settled): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(Operations.Settled))(settled))

const encodeAnswer = (answer: Operations.SettlementAnswer): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(Operations.SettlementAnswer))(answer))

const encodeAlreadySettled = (error: Operations.AlreadySettled): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(Operations.AlreadySettled))(error))

const decodeState = (text: string): Option.Option<Operations.OperationState> =>
  Schema.decodeOption(jsonCodecOf(Operations.OperationState))(text)

const decodeAnswer = (text: string): Option.Option<Operations.SettlementAnswer> =>
  Schema.decodeOption(jsonCodecOf(Operations.SettlementAnswer))(text)

const readState = (sql: SqlStorageLike): Option.Option<Operations.OperationState> => {
  const row = sql.exec('SELECT state FROM operation LIMIT 1').toArray()[0]
  return Option.flatMap(
    Option.fromUndefinedOr(row),
    (record) => Option.flatMap(Option.fromUndefinedOr(record['state']), (state) => decodeState(String(state))),
  )
}

const readExpiry = (sql: SqlStorageLike): Option.Option<Operations.SettlementAnswer> => {
  const row = sql.exec('SELECT expiry_answer FROM operation LIMIT 1').toArray()[0]
  return Option.flatMap(
    Option.fromUndefinedOr(row),
    (record) => Option.flatMap(Option.fromNullishOr(record['expiry_answer']), (answer) => decodeAnswer(String(answer))),
  )
}

const stateResponse = (state: Operations.OperationState): Effect.Effect<Response> =>
  Effect.map(encodeState(state), (body) => jsonOf(body))

const settledResponse = (settled: Operations.Settled): Effect.Effect<Response> =>
  Effect.map(encodeSettled(settled), (body) => jsonOf(body))

const alreadySettledResponse = (error: Operations.AlreadySettled): Effect.Effect<Response> =>
  Effect.map(encodeAlreadySettled(error), (body) => jsonOf(body, 409))

const pushQuietly = (waiter: OperationWaiter, line: Uint8Array): void => {
  try {
    waiter.push(line)
  } catch {
    return
  }
}

export const operationStoreOf = (options: OperationStoreOptions): OperationStoreHandlers => {
  const { ctx, sinks = [] } = options
  const { sql } = ctx.storage
  sql.exec('CREATE TABLE IF NOT EXISTS operation (state TEXT NOT NULL, expiry_answer TEXT)')
  sql.exec('CREATE TABLE IF NOT EXISTS sink_run (tag TEXT NOT NULL)')

  const waiters = new Set<OperationWaiter>()

  const settlementOf = (
    state: Operations.OperationState,
    settled: Operations.Settled,
    incomingJson: string,
  ): Settlement =>
    Match.value(state).pipe(
      Match.tag('Pending', () => {
        sql.exec('UPDATE operation SET state = ?', incomingJson)
        return { settled, committed: true }
      }),
      Match.tag('Settled', () => ({ settled, committed: false })),
      Match.exhaustive,
    )

  const commitSettlement = (
    answer: Operations.SettlementAnswer,
    settledAt: DateTime.Utc,
  ): Effect.Effect<Settlement, SettlementFailure> =>
    Effect.gen(function*() {
      const incomingJson = yield* encodeSettled(new Operations.Settled({ answer, settledAt }))
      const staged = ctx.storage.transactionSync((): StagedSettlement =>
        Option.match(readState(sql), {
          onNone: () => Option.none(),
          onSome: (state) =>
            Option.some(
              Result.map(
                Operations.settleOperation(new Operations.SettleOperation({ state, answer, settledAt })),
                (settled) => settlementOf(state, settled, incomingJson),
              ),
            ),
        })
      )
      const result = yield* Effect.fromOption(staged, () => new OperationMissing({}))
      return yield* Effect.fromResult(result)
    })

  const announceToWaiters = (settled: Operations.Settled): Effect.Effect<void> =>
    Effect.map(encodeSettled(settled), (json) => {
      const line = new TextEncoder().encode(`${json}\n`)
      for (const waiter of waiters) {
        waiters.delete(waiter)
        pushQuietly(waiter, line)
      }
    })

  const scheduleSinks = (settled: Operations.Settled): Effect.Effect<void> =>
    Effect.suspend(() => {
      const name = ctx.id.name
      if (name === undefined) return Effect.void
      return Option.match(Schema.decodeOption(Operations.OperationId)(name), {
        onNone: () => Effect.void,
        onSome: (operation) =>
          Effect.sync(() =>
            runSettlementSinks({
              sinks,
              operation,
              settled,
              waitUntil: (promise) => ctx.waitUntil(promise),
            })
          ),
      })
    })

  const onCommitted = (settled: Operations.Settled): Effect.Effect<void> =>
    Effect.flatMap(announceToWaiters(settled), () => scheduleSinks(settled))

  const settleCommitted = (settlement: Settlement): Effect.Effect<void> =>
    settlement.committed ? onCommitted(settlement.settled) : Effect.void

  const settleResponse = (settlement: Settlement): Effect.Effect<Response> =>
    Effect.flatMap(settleCommitted(settlement), () => settledResponse(settlement.settled))

  const settleFailureResponse = (failure: SettlementFailure): Effect.Effect<Response> =>
    Match.value(failure).pipe(
      Match.tag('OperationMissing', () => Effect.succeed(NotFoundResponse())),
      Match.tag('AlreadySettled', alreadySettledResponse),
      Match.exhaustive,
    )

  const begin = (request: Request): Effect.Effect<Response, Response> =>
    Effect.gen(function*() {
      const body = yield* decodeBegin(request)
      const encoded = yield* encodeState(new Operations.Pending({ owner: body.owner, startedAt: body.startedAt }))
      ctx.storage.transactionSync(() => {
        sql.exec('DELETE FROM operation')
        sql.exec('INSERT INTO operation (state, expiry_answer) VALUES (?, NULL)', encoded)
      })
      return new Response('began', { status: 201 })
    })

  const arm = (request: Request): Effect.Effect<Response, Response> =>
    Effect.gen(function*() {
      const body = yield* decodeArm(request)
      const encoded = yield* encodeAnswer(body.answer)
      const now = yield* DateTime.now
      ctx.storage.transactionSync(() => {
        sql.exec('UPDATE operation SET expiry_answer = ?', encoded)
      })
      ctx.storage.setAlarm(DateTime.toEpochMillis(now) + body.ttlMs)
      return new Response('armed', { status: 202 })
    })

  const settle = (request: Request): Effect.Effect<Response, Response> =>
    Effect.flatMap(decodeSettle(request), (body) =>
      Effect.matchEffect(commitSettlement(body.answer, body.settledAt), {
        onFailure: settleFailureResponse,
        onSuccess: settleResponse,
      }))

  const get = (_request: Request): Effect.Effect<Response> =>
    Effect.matchEffect(
      Effect.fromOption(ctx.storage.transactionSync(() => readState(sql)), () => undefined),
      { onFailure: () => Effect.succeed(NotFoundResponse()), onSuccess: stateResponse },
    )

  const watchResponse = (recorded: Operations.OperationState): Effect.Effect<Response> =>
    Effect.map(encodeState(recorded), (json) => {
      const initial = new TextEncoder().encode(`${json}\n`)
      const holder: { waiter?: OperationWaiter } = {}
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(initial)
          if (Schema.is(Operations.Settled)(recorded)) {
            controller.close()
            return
          }
          const waiter: OperationWaiter = {
            push: (line) => {
              controller.enqueue(line)
              controller.close()
            },
          }
          holder.waiter = waiter
          waiters.add(waiter)
        },
        cancel() {
          if (holder.waiter !== undefined) waiters.delete(holder.waiter)
        },
      })
      return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
    })

  const watch = (_request: Request): Effect.Effect<Response> =>
    Effect.matchEffect(
      Effect.fromOption(ctx.storage.transactionSync(() => readState(sql)), () => undefined),
      { onFailure: () => Effect.succeed(NotFoundResponse()), onSuccess: watchResponse },
    )

  const sinkRuns = (_request: Request): Effect.Effect<Response> =>
    Effect.sync(() => {
      const row = sql.exec('SELECT COUNT(*) AS runs FROM sink_run').toArray()[0]
      const runs = Option.match(Option.fromUndefinedOr(row), { onNone: () => 0, onSome: (record) => record['runs'] })
      return Response.json({ runs: typeof runs === 'number' ? runs : 0 })
    })

  const fetch = (request: Request): Effect.Effect<Response> =>
    Match.value(new URL(request.url).pathname).pipe(
      Match.when('/begin', () => begin(request)),
      Match.when('/arm', () => arm(request)),
      Match.when('/settle', () => settle(request)),
      Match.when('/get', () => get(request)),
      Match.when('/watch', () => watch(request)),
      Match.when('/sink-runs', () => sinkRuns(request)),
      Match.orElse(() => Effect.succeed(RouteMissingResponse())),
      Effect.catch((badRequest: Response) => Effect.succeed(badRequest)),
    )

  const alarm: Effect.Effect<void> = Effect.suspend(() =>
    Effect.flatMap(
      Effect.fromOption(readExpiry(sql), () => undefined),
      (answer) =>
        Effect.flatMap(DateTime.now, (settledAt) =>
          Effect.matchEffect(commitSettlement(answer, settledAt), {
            onFailure: () => Effect.void,
            onSuccess: settleCommitted,
          })),
    ).pipe(Effect.ignore)
  )

  return { fetch, alarm }
}
