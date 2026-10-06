import { Crypto, DateTime, Effect, HashMap, Layer, Ref, Result, Schema, Stream, SubscriptionRef } from 'effect'
import { Base64Url } from 'effect/encoding'
import {
  AlreadySettled,
  OperationNotFound,
  type OperationState,
  Pending,
  Settled,
  type SettlementAnswer,
} from '../Operations/operation-state.schema.js'
import { OperationId } from '../Operations/operation.schema.js'
import { Operations, type OperationsShape } from '../Operations/operations.service.js'
import { SettleOperation, settleOperation } from '../Operations/settle-operation.workflow.js'
import type { Principal } from '../Principal/principal.schema.js'

const operationIdBytes = 16

const mintedOperationId = (bytes: Uint8Array): Effect.Effect<OperationId> =>
  Schema.decodeEffect(OperationId)(Base64Url.encode(bytes)).pipe(Effect.orDie)

type OperationRef = SubscriptionRef.SubscriptionRef<OperationState>

const lookup = (
  state: HashMap.HashMap<OperationId, OperationRef>,
  id: OperationId,
): Effect.Effect<OperationRef, OperationNotFound> =>
  Effect.fromOption(HashMap.get(state, id), () => new OperationNotFound({ id }))

const settleOnce = (
  state: OperationState,
  answer: SettlementAnswer,
  settledAt: DateTime.Utc,
): readonly [Result.Result<Settled, AlreadySettled>, OperationState] =>
  Result.match(settleOperation(new SettleOperation({ state, answer, settledAt })), {
    onFailure: (error) => [Result.fail(error), state],
    onSuccess: (settled) => [Result.succeed(settled), settled],
  })

const makeOperations = (
  registry: Ref.Ref<HashMap.HashMap<OperationId, OperationRef>>,
  crypto: Crypto.Crypto,
): OperationsShape => ({
  begin: (owner: Principal) =>
    Effect.gen(function*() {
      const startedAt = yield* DateTime.now
      const id = yield* mintedOperationId(yield* crypto.randomBytes(operationIdBytes))
      const operation = yield* SubscriptionRef.make<OperationState>(new Pending({ owner, startedAt }))
      yield* Ref.update(registry, (state) => HashMap.set(state, id, operation))
      return id
    }),
  settle: (id, answer) =>
    Effect.gen(function*() {
      const settledAt = yield* DateTime.now
      const operation = yield* Effect.flatMap(Ref.get(registry), (state) => lookup(state, id))
      const settled = yield* SubscriptionRef.modify(operation, (state) => settleOnce(state, answer, settledAt))
      return yield* Effect.fromResult(settled)
    }),
  get: (id) =>
    Effect.flatMap(
      Effect.flatMap(Ref.get(registry), (state) => lookup(state, id)),
      (operation) => SubscriptionRef.get(operation),
    ),
  watch: (id) =>
    Stream.unwrap(
      Effect.map(
        Effect.flatMap(Ref.get(registry), (state) => lookup(state, id)),
        (operation) => SubscriptionRef.changes(operation).pipe(Stream.takeUntil(Schema.is(Settled))),
      ),
    ),
})

export const operationsMemoryLayer: Layer.Layer<Operations, never, Crypto.Crypto> = Layer.effect(
  Operations,
  Effect.gen(function*() {
    const registry = yield* Ref.make(HashMap.empty<OperationId, OperationRef>())
    const crypto = yield* Crypto.Crypto
    return makeOperations(registry, crypto)
  }),
)
