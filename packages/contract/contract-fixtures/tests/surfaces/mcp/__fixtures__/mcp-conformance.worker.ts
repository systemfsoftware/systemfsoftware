import {
  EXPECTED_TOOL_NAME,
  JSON_SCHEMA_2020_12_FIXTURE,
} from '#mcp-conformance/scenarios/server/json-schema-2020-12.js'
import {
  conformanceConfirmationKeyLayer,
  conformanceExtension,
  conformanceExtensions,
  conformanceVerifierLayer,
  registerExtraTools,
} from '@systemfsoftware/contract-fixtures'
import { type Capabilities, legacyProtocols, type McpMount, mount } from '@systemfsoftware/effect-contract/mcp'
import { Effect, Layer } from 'effect'
import { McpProtocol } from 'effect/ai'

const registry: Capabilities<never> = {}

interface DurableObjectId {
  readonly name: string
}

interface DurableObjectStateLike {
  readonly id: DurableObjectId
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
  readonly MCP_ORIGIN: string
  readonly MCP_RESOURCE_URL: string
}

const serverOf = (env: Env): McpMount =>
  mount(registry, {
    resourceUrl: env.MCP_RESOURCE_URL,
    allowedOrigins: [env.MCP_ORIGIN],
    protocols: [McpProtocol.v2026_07_28, ...legacyProtocols],
    provide: Layer.mergeAll(conformanceVerifierLayer, conformanceConfirmationKeyLayer),
    extensions: conformanceExtensions,
    extend: (mcpServer) =>
      Effect.gen(function*() {
        yield* conformanceExtension(mcpServer)
        yield* registerExtraTools(mcpServer, { name: EXPECTED_TOOL_NAME, inputSchema: JSON_SCHEMA_2020_12_FIXTURE })
      }),
  })

export class McpSession {
  private readonly server: McpMount

  constructor(_state: DurableObjectStateLike, env: Env) {
    this.server = serverOf(env)
  }

  fetch(request: Request): Promise<Response> {
    return this.server.handler(request)
  }
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    env.MCP_SESSION.get(env.MCP_SESSION.idFromName('conformance')).fetch(request),
}
