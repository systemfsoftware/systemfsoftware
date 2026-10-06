import { Contract, Operations } from '@systemfsoftware/effect-contract'
import { Crypto, DateTime, Effect, Layer, Match, PlatformError, Schema, Stream } from 'effect'
import { Base64Url } from 'effect/encoding'
import { jsonCodecOf } from './operation-codec.js'
import type { OperationIdLike } from './operation-store.js'
import { ArmOperation, BeginOperation, SettleOperation } from './operation-store.schema.js'

export interface OperationStubRequest {
  readonly method: string
  readonly body: string
}

export interface OperationStoreResponse {
  readonly ok: boolean
  readonly status: number
  readonly text: () => Promise<string>
  readonly body: AsyncIterable<Uint8Array> | null
}

export interface OperationStubLike {
  readonly fetch: (input: string, init?: OperationStubRequest) => Promise<OperationStoreResponse>
}

export interface OperationNamespaceLike {
  readonly idFromName: (name: string) => OperationIdLike
  readonly get: (id: OperationIdLike) => OperationStubLike
}

export interface OperationsLayerOptions {
  readonly namespace: OperationNamespaceLike
}

export interface ArmOperationOptions {
  readonly namespace: OperationNamespaceLike
  readonly operation: Operations.OperationId
  readonly ttlMs: number
  readonly answer: Operations.SettlementAnswer
}

const stubOf = (namespace: OperationNamespaceLike, id: Operations.OperationId): OperationStubLike =>
  namespace.get(namespace.idFromName(id))

const operationIdBytes = 16

const mintOperationId = (crypto: Crypto.Crypto): Effect.Effect<Operations.OperationId, PlatformError.PlatformError> =>
  Effect.flatMap(
    crypto.randomBytes(operationIdBytes),
    (bytes) => Effect.orDie(Schema.decodeEffect(Operations.OperationId)(Base64Url.encode(bytes))),
  )

const unreachable = (method: string): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    module: 'Operations',
    method,
    description: 'the operation store is unreachable',
  })

const encodeBegin = (owner: Contract.Principal, startedAt: DateTime.Utc): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(BeginOperation))({ owner, startedAt }))

const encodeSettle = (answer: Operations.SettlementAnswer, settledAt: DateTime.Utc): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(SettleOperation))({ answer, settledAt }))

const bodyOf = (response: OperationStoreResponse): Effect.Effect<string> => Effect.promise(() => response.text())

const decodeStateResponse = (text: string): Effect.Effect<Operations.OperationState> =>
  Effect.orDie(Schema.decodeEffect(jsonCodecOf(Operations.OperationState))(text))

const decodeSettledResponse = (text: string): Effect.Effect<Operations.Settled> =>
  Effect.orDie(Schema.decodeEffect(jsonCodecOf(Operations.Settled))(text))

const decodeAlreadySettledResponse = (text: string): Effect.Effect<Operations.AlreadySettled> =>
  Effect.orDie(Schema.decodeEffect(jsonCodecOf(Operations.AlreadySettled))(text))

const bodyStreamOf = (response: OperationStoreResponse): AsyncIterable<Uint8Array> => {
  const body = response.body
  if (body === null) throw new Error('the operation store answered without a body')
  return body
}

const operationsOf = (namespace: OperationNamespaceLike, crypto: Crypto.Crypto): Operations.OperationsShape => {
  const callOrDie = (
    id: Operations.OperationId,
    path: string,
    init?: OperationStubRequest,
  ): Effect.Effect<OperationStoreResponse> =>
    Effect.orDie(
      Effect.tryPromise({
        try: () => stubOf(namespace, id).fetch(`http://operation${path}`, init),
        catch: () => unreachable(path.slice(1)),
      }),
    )

  const begin = (owner: Contract.Principal): Effect.Effect<Operations.OperationId, PlatformError.PlatformError> =>
    Effect.gen(function*() {
      const id = yield* mintOperationId(crypto)
      const startedAt = yield* DateTime.now
      const body = yield* encodeBegin(owner, startedAt)
      const response = yield* Effect.tryPromise({
        try: () => stubOf(namespace, id).fetch('http://operation/begin', { method: 'POST', body }),
        catch: () => unreachable('begin'),
      })
      return yield* response.ok ? Effect.succeed(id) : Effect.fail(unreachable('begin'))
    })

  const settle = (
    id: Operations.OperationId,
    answer: Operations.SettlementAnswer,
  ): Effect.Effect<Operations.Settled, Operations.AlreadySettled | Operations.OperationNotFound> =>
    Effect.gen(function*() {
      const settledAt = yield* DateTime.now
      const body = yield* encodeSettle(answer, settledAt)
      const response = yield* callOrDie(id, '/settle', { method: 'POST', body })
      return yield* Match.value(response.status).pipe(
        Match.when(404, () => Effect.fail(new Operations.OperationNotFound({ id }))),
        Match.when(
          409,
          () =>
            Effect.flatMap(bodyOf(response), (text) => Effect.flatMap(decodeAlreadySettledResponse(text), Effect.fail)),
        ),
        Match.orElse(() => Effect.flatMap(bodyOf(response), decodeSettledResponse)),
      )
    })

  const get = (id: Operations.OperationId): Effect.Effect<Operations.OperationState, Operations.OperationNotFound> =>
    Effect.gen(function*() {
      const response = yield* callOrDie(id, '/get')
      return yield* response.status === 404
        ? Effect.fail(new Operations.OperationNotFound({ id }))
        : Effect.flatMap(bodyOf(response), decodeStateResponse)
    })

  const readStates = (
    response: OperationStoreResponse,
    id: Operations.OperationId,
  ): Stream.Stream<Operations.OperationState, Operations.OperationNotFound> => {
    const chunks = Stream.fromAsyncIterable<Uint8Array, Operations.OperationNotFound>(
      bodyStreamOf(response),
      () => new Operations.OperationNotFound({ id }),
    )
    const lines = Stream.splitLines(Stream.decodeText(chunks))
    return lines.pipe(
      Stream.filter((line) => line.length > 0),
      Stream.mapEffect(decodeStateResponse),
    )
  }

  const watch = (id: Operations.OperationId): Stream.Stream<Operations.OperationState, Operations.OperationNotFound> =>
    Stream.unwrap(
      Effect.gen(function*() {
        const response = yield* callOrDie(id, '/watch')
        return yield* response.status === 404
          ? Effect.fail(new Operations.OperationNotFound({ id }))
          : Effect.succeed(readStates(response, id))
      }),
    )

  return { begin, settle, get, watch }
}

export const layer = (options: OperationsLayerOptions): Layer.Layer<Operations.Operations, never, Crypto.Crypto> =>
  Layer.effect(
    Operations.Operations,
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      return operationsOf(options.namespace, crypto)
    }),
  )

const encodeArm = (ttlMs: number, answer: Operations.SettlementAnswer): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(jsonCodecOf(ArmOperation))({ ttlMs, answer }))

export const armOperation = (options: ArmOperationOptions): Effect.Effect<void> =>
  Effect.gen(function*() {
    const body = yield* encodeArm(options.ttlMs, options.answer)
    yield* Effect.orDie(
      Effect.tryPromise({
        try: () => stubOf(options.namespace, options.operation).fetch('http://operation/arm', { method: 'POST', body }),
        catch: () => unreachable('arm'),
      }),
    )
  })
