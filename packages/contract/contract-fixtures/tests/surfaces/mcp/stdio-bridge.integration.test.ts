import { relay, type StdioTransport } from '@systemfsoftware/effect-contract/mcp'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  bundle,
  Harness,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, type PlatformError, Schema } from 'effect'
import { BEARER_TOKEN } from './__fixtures__/mcp.fixture.js'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./__fixtures__/mcp.worker.ts', import.meta.url).pathname)),
)

const PROTOCOL = '2026-07-28'
const meta = {
  'io.modelcontextprotocol/protocolVersion': PROTOCOL,
  'io.modelcontextprotocol/clientCapabilities': {},
}

const encodeLine = (value: Schema.Json): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(value))

const transportFor = (harness: HarnessShape, headers: Readonly<Record<string, string>>): StdioTransport => ({
  post: (body) =>
    Effect.gen(function*() {
      const response = yield* Effect.orDie(
        harness.dispatchFetch('http://mcp.test/mcp', { method: 'POST', headers, body }),
      )
      const text = yield* Effect.promise(() => response.text())
      return { status: response.status, body: text }
    }),
})

interface Observation {
  readonly listRelayed: string
  readonly listBody: string
  readonly callRelayed: string
  readonly callBody: string
}

const listHeaders = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': PROTOCOL,
  'mcp-method': 'tools/list',
  authorization: `Bearer ${BEARER_TOKEN}`,
}

const callHeaders = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': PROTOCOL,
  'mcp-method': 'tools/call',
  'mcp-name': 'getBalance',
  authorization: `Bearer ${BEARER_TOKEN}`,
}

const observed = (): Effect.Effect<Observation, HarnessStartFailed | PlatformError.PlatformError> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const listLine = yield* encodeLine({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } })
    const listTransport = transportFor(harness, listHeaders)
    const listBody = (yield* listTransport.post(listLine)).body
    const listRelayed = yield* relay(listLine, listTransport)
    const callLine = yield* encodeLine({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'getBalance', arguments: { account: 'acct_00000000' }, _meta: meta },
    })
    const callTransport = transportFor(harness, callHeaders)
    const callBody = (yield* callTransport.post(callLine)).body
    const callRelayed = yield* relay(callLine, callTransport)
    return { listRelayed, listBody, callRelayed, callBody }
  }).pipe(Effect.provide(layer({ worker })))

Feature('Relaying JSON-RPC bytes through the MCP stdio bridge')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime serves the mounted fixture Worker')
  .body(({ scenario }) => {
    scenario(
      'A tools/list and a tools/call are relayed byte-for-byte without parsing the payload',
      Gherkin.Do.pipe(
        When('each JSON-RPC line is posted through the bridge transport')('observed', observed),
        Then('the relayed text is the worker answer plus only a newline')((scope, expect) =>
          expect({
            listByteForByte: scope.observed.listRelayed === `${scope.observed.listBody}\n`,
            listListsTools: scope.observed.listBody.includes('getBalance'),
            callByteForByte: scope.observed.callRelayed === `${scope.observed.callBody}\n`,
            callAnswersCompleted: scope.observed.callBody.includes('Completed'),
          }).toEqual({
            listByteForByte: true,
            listListsTools: true,
            callByteForByte: true,
            callAnswersCompleted: true,
          })
        ),
      ),
    )
  })
