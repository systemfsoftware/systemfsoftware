import { fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Operations } from '@systemfsoftware/effect-contract'
import { mount } from '@systemfsoftware/effect-contract/http'
import { Crypto, Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/http'

const cryptoLayer: Layer.Layer<Crypto.Crypto> = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.map(
        Effect.promise(() => crypto.subtle.digest(algorithm, new Uint8Array(data))),
        (buffer) => new Uint8Array(buffer),
      ),
  }),
)

const environment = Layer.mergeAll(
  Operations.operationsMemoryLayer.pipe(Layer.provide(cryptoLayer)),
  cryptoLayer,
  fixtureLedgerLayer,
)

const { handler } = HttpRouter.toWebHandler(HttpRouter.provideRequest(environment)(mount(registry).layer))

export default { fetch: handler }
