import { type CallToolResult, Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  bundle,
  Harness,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Option, Schema } from 'effect'
import { BEARER_TOKEN } from './__fixtures__/mcp.fixture.js'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./__fixtures__/mcp-protocol.worker.ts', import.meta.url).pathname)),
)

const STATELESS = '2026-07-28'
const UNSUPPORTED = '2099-01-01'
const REVISIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const encode = (value: Schema.Json): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(value))

const post = (harness: HarnessShape, headers: Readonly<Record<string, string>>, body: string) =>
  Effect.orDie(harness.dispatchFetch('http://mcp.test/mcp', { method: 'POST', headers, body }))

const bodyOfText = (text: string): Effect.Effect<Schema.JsonObject> =>
  Effect.orDie(Schema.decodeEffect(Schema.fromJsonString(Schema.JsonObject))(text))

const errorCodeOf = (body: Schema.JsonObject): number | undefined =>
  Option.getOrUndefined(
    Option.map(
      Schema.decodeUnknownOption(Schema.Struct({ error: Schema.Struct({ code: Schema.Finite }) }))(body),
      (decoded) => decoded.error.code,
    ),
  )

const supportedOf = (body: Schema.JsonObject): ReadonlyArray<string> | undefined =>
  Option.getOrUndefined(
    Option.map(
      Schema.decodeUnknownOption(
        Schema.Struct({ error: Schema.Struct({ data: Schema.Struct({ supported: Schema.Array(Schema.String) }) }) }),
      )(body),
      (decoded) => decoded.error.data.supported,
    ),
  )

const statelessMeta = {
  'io.modelcontextprotocol/protocolVersion': STATELESS,
  'io.modelcontextprotocol/clientCapabilities': {},
}

interface HeaderObservation {
  readonly missingNameStatus: number
  readonly missingNameCode: number | undefined
  readonly unsupportedStatus: number
  readonly unsupportedCode: number | undefined
  readonly unsupportedRevisions: ReadonlyArray<string> | undefined
}

const headerObservation = (): Effect.Effect<HeaderObservation, HarnessStartFailed> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const missingName = yield* post(
      harness,
      {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': STATELESS,
        'mcp-method': 'tools/call',
        authorization: `Bearer ${BEARER_TOKEN}`,
      },
      yield* encode({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'getBalance', arguments: { account: 'acct_00000000' }, _meta: statelessMeta },
      }),
    )
    const missingNameCode = errorCodeOf(yield* bodyOfText(yield* Effect.promise(() => missingName.text())))
    const unsupported = yield* post(
      harness,
      {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': UNSUPPORTED,
        'mcp-method': 'tools/call',
        'mcp-name': 'getBalance',
        authorization: `Bearer ${BEARER_TOKEN}`,
      },
      yield* encode({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'getBalance',
          arguments: { account: 'acct_00000000' },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': UNSUPPORTED,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    )
    const unsupportedBody = yield* bodyOfText(yield* Effect.promise(() => unsupported.text()))
    return {
      missingNameStatus: missingName.status,
      missingNameCode,
      unsupportedStatus: unsupported.status,
      unsupportedCode: errorCodeOf(unsupportedBody),
      unsupportedRevisions: supportedOf(unsupportedBody),
    }
  }).pipe(Effect.provide(layer({ worker })))

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

interface LegacyObservation {
  readonly listsBalance: boolean
  readonly callCompleted: boolean
}

const legacyObservation = (): Effect.Effect<LegacyObservation, HarnessStartFailed> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const client = new Client(
      { name: 'legacy-client', version: '1.0.0' },
      { capabilities: {}, supportedProtocolVersions: ['2025-06-18'] },
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
    }
  }).pipe(Effect.provide(layer({ worker })))

Feature('Serving the MCP protocol edge in real workerd')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime serves the mounted fixture Worker')
  .body(({ scenario }) => {
    scenario(
      'A missing Mcp-Name is refused with a header mismatch and an unknown version lists the revisions',
      Gherkin.Do.pipe(
        When('a tools/call omits Mcp-Name and another names an unsupported protocol version')(
          'observed',
          headerObservation,
        ),
        Then('the first answers 400 header mismatch and the second 400 listing every supported revision')(
          (scope, expect) =>
            expect(scope.observed).toEqual({
              missingNameStatus: 400,
              missingNameCode: -32020,
              unsupportedStatus: 400,
              unsupportedCode: -32022,
              unsupportedRevisions: REVISIONS,
            }),
        ),
      ),
    )

    scenario(
      'A 2025-06-18 client lists and calls tools after initializing',
      Gherkin.Do.pipe(
        When('a legacy client initializes and then lists and calls a tool')('observed', legacyObservation),
        Then('the tool list and the call are answered')((scope, expect) =>
          expect(scope.observed).toEqual({ listsBalance: true, callCompleted: true })
        ),
      ),
    )
  })
