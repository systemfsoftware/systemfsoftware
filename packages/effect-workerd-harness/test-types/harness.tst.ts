import {
  bundle,
  type BundledWorker,
  Harness,
  type HarnessOptions,
  HarnessStartFailed,
  layer,
  type WorkerBundleFailed,
} from '@systemfsoftware/effect-workerd-harness'
import type { Effect, Layer } from 'effect'
import { expect } from 'tstyche'

const options: HarnessOptions = { worker: 'export default { fetch: () => new Response() }' }

expect(bundle).type.toBeCallableWith('./worker.ts')
expect(bundle).type.not.toBeCallableWith(42)
expect(bundle('./worker.ts')).type.toBe<Effect.Effect<BundledWorker, WorkerBundleFailed, never>>()

expect(layer).type.toBeCallableWith(options)
expect(layer).type.not.toBeCallableWith({ durableObjects: [] })
expect(layer).type.not.toBeCallableWith({ worker: 'x', durableObjects: [{ className: 'A', storage: 'postgres' }] })
expect(layer(options)).type.toBe<Layer.Layer<Harness, HarnessStartFailed, never>>()
