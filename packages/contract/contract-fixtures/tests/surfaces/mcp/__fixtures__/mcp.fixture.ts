import { FixtureLedger, fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Contract, Operations, Principal } from '@systemfsoftware/effect-contract'
import { McpConfirmationKey, mount } from '@systemfsoftware/effect-contract/mcp'
import { operationsMemoryLayer } from '@systemfsoftware/effect-contract/testing'
import { Crypto, Effect, Layer } from 'effect'
import { importConfirmationKey } from './mcp-key.fixture.js'
import { verifierLayer } from './mcp-principal.fixture.js'

export { CONFIRMATION_KEY_B64URL, importConfirmationKey } from './mcp-key.fixture.js'
export { BEARER_TOKEN, person, verifierLayer } from './mcp-principal.fixture.js'

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

const operationsLayer = operationsMemoryLayer.pipe(Layer.provide(cryptoLayer))

const confirmationKeyLayer: Layer.Layer<McpConfirmationKey> = Layer.effect(
  McpConfirmationKey,
  Effect.promise(importConfirmationKey),
)

export const environment: Layer.Layer<
  FixtureLedger | Operations.Operations | Principal.TokenVerifier | McpConfirmationKey | Crypto.Crypto
> = Layer.mergeAll(
  fixtureLedgerLayer,
  operationsLayer,
  verifierLayer,
  confirmationKeyLayer,
  cryptoLayer,
)

export const server = mount(registry, {
  resourceUrl: 'http://mcp.test/mcp',
  allowedOrigins: ['http://mcp.test'],
  provide: environment,
})

export const endpoint = 'http://mcp.test/mcp'

export const anonymous = new Contract.Anonymous({})
