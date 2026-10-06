import type { Operations } from '@systemfsoftware/effect-contract'
import { operationsMemoryLayer } from '@systemfsoftware/effect-contract/testing'
import { Crypto, Effect, Layer } from 'effect'

const crypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.map(
      Effect.promise(() => globalThis.crypto.subtle.digest(algorithm, new Uint8Array(data))),
      (buffer) => new Uint8Array(buffer),
    ),
})

export const operationsEnvironment: Layer.Layer<Operations.Operations> = operationsMemoryLayer.pipe(
  Layer.provide(Layer.succeed(Crypto.Crypto)(crypto)),
)
