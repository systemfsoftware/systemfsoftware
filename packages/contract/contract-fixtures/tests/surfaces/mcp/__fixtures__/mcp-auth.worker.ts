import { fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Operations, Principal } from '@systemfsoftware/effect-contract'
import { McpConfirmationKey, type McpMount, mount } from '@systemfsoftware/effect-contract/mcp'
import { Effect, Layer, Stream } from 'effect'
import { MCP_ISSUER, MCP_ORIGIN, MCP_RESOURCE_URL } from './mcp-auth.constants.js'

interface Env {
  readonly JWKS_URI: string
}

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
  Effect.promise(() => crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify'])),
)

const cached: { current?: McpMount | undefined } = {}

const serve = (env: Env): McpMount => {
  const existing = cached.current
  if (existing !== undefined) {
    return existing
  }
  const built = mount(registry, {
    resourceUrl: MCP_RESOURCE_URL,
    allowedOrigins: [MCP_ORIGIN],
    provide: Layer.mergeAll(
      fixtureLedgerLayer,
      emptyStore,
      confirmationKeyLayer,
      Principal.TokenVerifier.layer({
        jwksUri: env.JWKS_URI,
        audience: MCP_RESOURCE_URL,
        issuer: MCP_ISSUER,
        algorithms: ['ES256'],
      }),
    ),
  })
  cached.current = built
  return built
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => serve(env).handler(request),
}
