import {
  armOperation,
  layer as operationsLayer,
  type OperationNamespaceLike,
  type OperationStoreResponse,
  type OperationStubLike,
  type OperationStubRequest,
} from '@systemfsoftware/agent-front-door/operations'
import { Operations } from '@systemfsoftware/effect-contract'
import {
  bundle,
  Harness,
  type HarnessOptions,
  type HarnessShape,
  layer as harnessLayer,
} from '@systemfsoftware/effect-workerd-harness'
import { Context, Crypto, Effect, Layer, Schema, Scope } from 'effect'

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./operations.worker.ts', import.meta.url).pathname)),
)

const options: HarnessOptions = {
  worker,
  durableObjects: [{ className: 'OperationStore', storage: 'sqlite' }],
  bindings: [{ _tag: 'DurableObject', name: 'OPERATIONS', className: 'OperationStore' }],
}

const scope = await Effect.runPromise(Scope.make())
const context = await Effect.runPromise(Layer.buildWithScope(Layer.orDie(harnessLayer(options)), scope))

export const harness: HarnessShape = Context.get(context, Harness)

const reachable = (name: string, input: string, init?: OperationStubRequest): Promise<OperationStoreResponse> => {
  const url = new URL(`/op/${name}${new URL(input).pathname}`, harness.url).toString()
  return Effect.runPromise(Effect.orDie(harness.dispatchFetch(url, init)))
}

export const cryptoLayer: Layer.Layer<Crypto.Crypto> = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.map(
        Effect.promise(() => globalThis.crypto.subtle.digest(algorithm, new Uint8Array(data))),
        (buffer) => new Uint8Array(buffer),
      ),
  }),
)

export const namespace: OperationNamespaceLike = {
  idFromName: (name) => ({ name }),
  get: (id): OperationStubLike => ({
    fetch: (input, init) => reachable(id.name ?? '', input, init),
  }),
}

export const storeLayer: Layer.Layer<Operations.Operations> = operationsLayer({ namespace }).pipe(
  Layer.provide(cryptoLayer),
)

const SinkRuns = Schema.Struct({ runs: Schema.Int })

export const sinkRuns = (operation: Operations.OperationId): Effect.Effect<number> =>
  Effect.flatMap(
    Effect.promise(() => reachable(operation, 'http://operation/sink-runs').then((response) => response.text())),
    (text) => Effect.orDie(Effect.map(Schema.decodeEffect(Schema.fromJsonString(SinkRuns))(text), (body) => body.runs)),
  )

export interface ArmOptions {
  readonly operation: Operations.OperationId
  readonly ttlMs: number
  readonly answer: Operations.SettlementAnswer
}

export const arm = (options: ArmOptions): Effect.Effect<void> => armOperation({ namespace, ...options })
