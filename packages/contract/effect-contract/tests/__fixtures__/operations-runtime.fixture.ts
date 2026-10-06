import { operationsMemoryLayer } from '@systemfsoftware/effect-contract/testing'
import { Crypto, Effect, Layer, MutableRef } from 'effect'

const mintLength = 4

const mintedBytes = (mint: number, size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  new DataView(bytes.buffer).setUint32(size - mintLength, mint)
  return bytes
}

const mintingCrypto = (): Layer.Layer<Crypto.Crypto> => {
  const minted = MutableRef.make(0)
  return Layer.succeed(
    Crypto.Crypto,
    Crypto.make({
      randomBytes: (size) => mintedBytes(MutableRef.incrementAndGet(minted), size),
      digest: (_algorithm, data) => Effect.succeed(data),
    }),
  )
}

export const operationsScenarioEnvironment = Layer.unwrap(
  Effect.sync(() => operationsMemoryLayer.pipe(Layer.provide(mintingCrypto()))),
)
