import { fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Operations } from '@systemfsoftware/effect-contract'
import { McpConfirmationKey, type McpMount, mount } from '@systemfsoftware/effect-contract/mcp'
import { Effect, Layer, Stream } from 'effect'
import { importConfirmationKey } from './mcp-key.fixture.js'
import { verifierLayer } from './mcp-principal.fixture.js'

const unused = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`the fixture Worker never calls Operations.${method}`))

const emptyStore = Layer.succeed(Operations.Operations)({
  begin: () => unused('begin'),
  settle: () => unused('settle'),
  get: (id) => Effect.fail(new Operations.OperationNotFound({ id })),
  watch: () => Stream.empty,
})

const confirmationKeyLayer: Layer.Layer<McpConfirmationKey> = Layer.effect(
  McpConfirmationKey,
  Effect.promise(importConfirmationKey),
)

const cached: { current?: McpMount | undefined } = {}

const serve = (): McpMount => {
  const existing = cached.current
  if (existing !== undefined) {
    return existing
  }
  const built = mount(registry, {
    resourceUrl: 'http://mcp.test/mcp',
    allowedOrigins: ['http://mcp.test'],
    provide: Layer.mergeAll(fixtureLedgerLayer, emptyStore, confirmationKeyLayer, verifierLayer),
  })
  cached.current = built
  return built
}

export default {
  fetch: (request: Request): Promise<Response> => serve().handler(request),
}
