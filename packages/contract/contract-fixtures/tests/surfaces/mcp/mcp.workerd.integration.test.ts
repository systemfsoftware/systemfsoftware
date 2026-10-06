import { type CallToolResult, Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { registry } from '@systemfsoftware/contract-fixtures'
import { Contract } from '@systemfsoftware/effect-contract'
import { directClient } from '@systemfsoftware/effect-contract/testing'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  bundle,
  Harness,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Equal, Layer, Schema } from 'effect'
import { sampledInputs } from '../rpc/__fixtures__/sampling.fixture.js'
import { decodeJsonText, UnavailableJson } from './__fixtures__/mcp-reply.fixture.js'
import { anonymous, BEARER_TOKEN, environment } from './__fixtures__/mcp.fixture.js'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./__fixtures__/mcp.worker.ts', import.meta.url).pathname)),
)

const numRuns = 3

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

const censusOf = (result: CallToolResult): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  Effect.gen(function*() {
    const parsed = yield* decodeJsonText(firstText(result))
    return yield* Schema.is(UnavailableJson)(parsed)
      ? yield* new Contract.Unavailable({ reason: parsed.reason })
      : Effect.succeed(parsed)
  })

type Outcome = { readonly ok: true; readonly census: Schema.Json } | { readonly ok: false; readonly reason: string }

const outcomeOf = <R>(
  effect: Effect.Effect<Schema.Json, Contract.Unavailable, R>,
): Effect.Effect<Outcome, never, R> =>
  Effect.match(effect, {
    onFailure: (error): Outcome => ({ ok: false, reason: error.reason }),
    onSuccess: (census): Outcome => ({ ok: true, census }),
  })

const toolNames = Object.keys(registry)

interface Observation {
  readonly mismatches: ReadonlyArray<string>
  readonly missing: ReadonlyArray<string>
}

const observed = (): Effect.Effect<Observation, HarnessStartFailed> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const client = new Client(
      { name: 'parity-client', version: '1.0.0' },
      {
        capabilities: { elicitation: {} },
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      },
    )
    client.setRequestHandler('elicitation/create', () =>
      Promise.resolve({ action: 'accept' as const, content: { approve: true } }))
    yield* Effect.orDie(
      Effect.tryPromise(() =>
        client.connect(
          new StreamableHTTPClientTransport(new URL('http://mcp.test/mcp'), { fetch: bridgedFetch(harness) }),
        )
      ),
    )
    const listed = yield* Effect.orDie(Effect.tryPromise(() =>
      client.listTools()
    ))
    const listedNames = listed.tools.map((tool) => tool.name)
    const direct = directClient({ registry, provide: environment })
    const mismatches = yield* Effect.forEach(Object.entries(registry), ([name, capability]) =>
      Effect.forEach(sampledInputs({ input: capability.contract.input, count: numRuns, seed: 1 }), (input, index) =>
        Effect.gen(function*() {
          const reference = yield* outcomeOf(direct.call(name, { input, principal: anonymous }))
          const candidate = yield* outcomeOf(
            Effect.orDie(
              Effect.tryPromise(() =>
                client.callTool({
                  name,
                  arguments: Schema.is(Schema.JsonObject)(input) ? input : {},
                })
              ),
            ).pipe(Effect.flatMap(censusOf)),
          )
          return Equal.equals(reference, candidate) ? '' : `${name} sample ${index}`
        })))
    return {
      mismatches: mismatches.flat().filter((entry) =>
        entry !== ''
      ),
      missing: toolNames.filter((name) => !listedNames.includes(name)),
    }
  }).pipe(Effect.provide(Layer.merge(layer({ worker }), environment)))

Feature('Reaching every fixture capability through the MCP client SDK in real workerd')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime serves the mounted fixture Worker')
  .body(({ scenario }) => {
    scenario(
      'The client SDK lists every fixture capability and answers the same census as the direct call',
      Gherkin.Do.pipe(
        When('every fixture capability is sampled and called through the SDK client')('observed', observed),
        Then('no sampled input disagrees and no capability is missing')((scope, expect) =>
          expect({ mismatches: scope.observed.mismatches, missing: scope.observed.missing }).toEqual({
            mismatches: [],
            missing: [],
          })
        ),
      ),
    )
  })
