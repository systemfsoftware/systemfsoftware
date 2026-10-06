import { fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Operations } from '@systemfsoftware/effect-contract'
import { McpConfirmationKey, type McpMount, mount, sessionServe } from '@systemfsoftware/effect-contract/mcp'
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

const environment = Layer.mergeAll(fixtureLedgerLayer, emptyStore, confirmationKeyLayer, verifierLayer)

const options = {
  resourceUrl: 'http://mcp.test/mcp',
  allowedOrigins: ['http://mcp.test'],
  provide: environment,
}

let stateless: McpMount | undefined

const statelessMount = (): McpMount => {
  stateless ??= mount(registry, options)
  return stateless
}

let sessions: McpMount | undefined

const sessionMount = (): McpMount => {
  sessions ??= sessionServe(registry, options)
  return sessions
}

interface DurableObjectId {
  readonly name: string
}

interface SessionStub {
  fetch(request: Request): Promise<Response>
}

interface SessionNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): SessionStub
}

interface Env {
  readonly MCP_SESSION: SessionNamespace
}

export class McpSession {
  fetch(request: Request): Promise<Response> {
    return sessionMount().handler(request)
  }
}

const statelessVersion = '2026-07-28'

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    request.headers.get('mcp-protocol-version') === statelessVersion
      ? statelessMount().handler(request)
      : env.MCP_SESSION.get(env.MCP_SESSION.idFromName('legacy-sessions')).fetch(request),
}
