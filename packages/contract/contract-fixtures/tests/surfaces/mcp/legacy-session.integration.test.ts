import { type CallToolResult, Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  bundle,
  Harness,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Schema } from 'effect'
import { BEARER_TOKEN } from './__fixtures__/mcp.fixture.js'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./__fixtures__/legacy-session.worker.ts', import.meta.url).pathname)),
)

const harnessLayer = layer({
  worker,
  durableObjects: [{ className: 'McpSession', storage: 'sqlite' }],
  bindings: [{ _tag: 'DurableObject', name: 'MCP_SESSION', className: 'McpSession' }],
})

const bridgedFetch = (harness: HarnessShape) => (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const url = input instanceof Request ? input.url : input.toString()
      const headers = new Headers(init?.headers)
      headers.set('authorization', `Bearer ${BEARER_TOKEN}`)
      const body = init?.body
      const response = yield* Effect.orDie(
        harness.dispatchFetch(url, {
          method: init?.method ?? 'GET',
          headers: Object.fromEntries(headers),
          ...(typeof body === 'string' ? { body } : {}),
        }),
      )
      const text = yield* Effect.promise(() => response.text())
      return new Response(text, { status: response.status, headers: Object.fromEntries(response.headers) })
    }),
  )

const firstText = (result: CallToolResult): string => {
  const part = result.content.find((entry) => entry.type === 'text')
  return part !== undefined && 'text' in part ? part.text : ''
}

const unknownSession = (harness: HarnessShape): Effect.Effect<number> =>
  Effect.gen(function*() {
    const body = yield* Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/list',
      params: {},
    })
    const response = yield* harness.dispatchFetch('http://mcp.test/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
        'mcp-session-id': 'no-such-session',
        authorization: `Bearer ${BEARER_TOKEN}`,
      },
      body,
    })
    return response.status
  }).pipe(Effect.orDie)

interface Observation {
  readonly listsBalance: boolean
  readonly callCompleted: boolean
  readonly unknownSessionStatus: number
}

const observed = (): Effect.Effect<Observation, HarnessStartFailed> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const client = new Client(
      { name: 'legacy-session-client', version: '1.0.0' },
      { capabilities: {}, supportedProtocolVersions: ['2025-11-25'] },
    )
    yield* Effect.orDie(
      Effect.tryPromise(() =>
        client.connect(
          new StreamableHTTPClientTransport(new URL('http://mcp.test/mcp'), { fetch: bridgedFetch(harness) }),
        )
      ),
    )
    const listed = yield* Effect.orDie(Effect.tryPromise(() => client.listTools()))
    const called = yield* Effect.orDie(
      Effect.tryPromise(() => client.callTool({ name: 'getBalance', arguments: { account: 'acct_00000000' } })),
    )
    return {
      listsBalance: listed.tools.some((tool) => tool.name === 'getBalance'),
      callCompleted: firstText(called).includes('Completed'),
      unknownSessionStatus: yield* unknownSession(harness),
    }
  }).pipe(Effect.provide(harnessLayer))

Feature('Serving a legacy MCP session from a Durable Object in real workerd')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime serves the fixture Worker with its session Durable Object')
  .body(({ scenario }) => {
    scenario(
      'A 2025-11-25 client initializes, lists and calls, and an unknown session id answers 404',
      Gherkin.Do.pipe(
        When('a legacy client initializes and then lists and calls a tool, and a foreign session id is posted')(
          'observed',
          observed,
        ),
        Then('the session survives in the Durable Object and the foreign id is refused')((scope, expect) =>
          expect(scope.observed).toEqual({ listsBalance: true, callCompleted: true, unknownSessionStatus: 404 })
        ),
      ),
    )
  })
