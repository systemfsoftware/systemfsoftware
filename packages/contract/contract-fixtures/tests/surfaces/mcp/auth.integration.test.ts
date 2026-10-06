import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/client'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  bundle,
  Harness,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Schema } from 'effect'
import { type JwksFixture, JwksServer, JwksServerLive } from '../../__fixtures__/jwks-server.fixture.js'
import { MCP_ORIGIN, MCP_RESOURCE_URL } from './__fixtures__/mcp-auth.constants.js'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./__fixtures__/mcp-auth.worker.ts', import.meta.url).pathname)),
)

const harnessLayer = (jwksUri: string): Layer.Layer<Harness, HarnessStartFailed> =>
  layer({ worker, bindings: [{ _tag: 'PlainText', name: 'JWKS_URI', value: jwksUri }] })

interface Observation {
  readonly status: number
  readonly authenticate: string
  readonly body: string
}

const dispatch = (harness: HarnessShape, request: Request) =>
  Effect.gen(function*() {
    const body = yield* Effect.promise(() => request.text())
    return yield* Effect.orDie(
      harness.dispatchFetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        ...(body.length === 0 ? {} : { body }),
      }),
    )
  })

const observe = (harness: HarnessShape, request: Request): Effect.Effect<Observation> =>
  Effect.gen(function*() {
    const response = yield* dispatch(harness, request)
    const body = yield* Effect.promise(() => response.text())
    return { status: response.status, authenticate: response.headers.get('www-authenticate') ?? '', body }
  })

const statelessMeta: Schema.JsonObject = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
}

const toolCall = (token: string | undefined, name: string, args: Schema.JsonObject): Effect.Effect<Request> =>
  Effect.gen(function*() {
    const body = yield* Effect.orDie(
      Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args, _meta: statelessMeta },
      }),
    )
    return new Request(MCP_RESOURCE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': name,
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body,
    })
  })

const harnessFetch = (harness: HarnessShape) => (input: RequestInfo | URL): Promise<Response> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const response = yield* dispatch(harness, new Request(url))
      const body = yield* Effect.promise(() => response.text())
      return new Response(body, {
        status: response.status,
        headers: Object.fromEntries(response.headers),
      })
    }),
  )

const metadataResourceAt = (harness: HarnessShape, resourceMetadataUrl: string | undefined): Effect.Effect<string> =>
  Effect.promise(() =>
    discoverOAuthProtectedResourceMetadata(
      MCP_RESOURCE_URL,
      resourceMetadataUrl === undefined ? {} : { resourceMetadataUrl },
      harnessFetch(harness),
    ).then((metadata) => metadata.resource)
  )

interface Observations {
  readonly wrongAudience: Observation
  readonly missingWrite: Observation
  readonly anonymousRead: Observation
  readonly metadataRoot: string
  readonly metadataPath: string
}

const observations = (jwks: JwksFixture): Effect.Effect<Observations, HarnessStartFailed> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const wrongAudienceToken = yield* jwks.sign({ audience: 'https://elsewhere.test/resource' })
    const missingWriteToken = yield* jwks.sign({ audience: MCP_RESOURCE_URL, scope: 'read:statement' })
    const wrongAudienceRequest = yield* toolCall(wrongAudienceToken, 'transfer', {
      account: 'acct_00000000',
      cents: 10,
    })
    const missingWriteRequest = yield* toolCall(missingWriteToken, 'transfer', { account: 'acct_00000000', cents: 10 })
    const anonymousRequest = yield* toolCall(undefined, 'getBalance', { account: 'acct_00000000' })
    return {
      wrongAudience: yield* observe(harness, wrongAudienceRequest),
      missingWrite: yield* observe(harness, missingWriteRequest),
      anonymousRead: yield* observe(harness, anonymousRequest),
      metadataRoot: yield* metadataResourceAt(harness, undefined),
      metadataPath: yield* metadataResourceAt(harness, `${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`),
    }
  }).pipe(Effect.provide(harnessLayer(jwks.uri)))

const givenJwks = Given('a JSON Web Key Set published at a loopback endpoint')('jwks', () => JwksServer)

Feature('Authenticating the MCP surface in real workerd')
  .live('a real workerd runtime serves the mounted fixture Worker')
  .withLayer(JwksServerLive)
  .body(({ scenario }) => {
    scenario(
      'A wrong-audience token is refused, a scope-less token is forbidden, and a Public Read is admitted',
      Gherkin.Do.pipe(
        givenJwks,
        When('the fixture Worker answers the three authorization cases and both metadata paths')(
          'observed',
          (s) => observations(s.jwks),
        ),
        Then('the three authorization cases and both metadata paths answer as the spec requires')((s, expect) =>
          expect({
            wrongAudience: {
              status: s.observed.wrongAudience.status,
              carriesResourceMetadata: s.observed.wrongAudience.authenticate.includes('resource_metadata="'),
            },
            missingWrite: {
              status: s.observed.missingWrite.status,
              insufficientScope: s.observed.missingWrite.authenticate.includes('error="insufficient_scope"'),
            },
            anonymousRead: {
              status: s.observed.anonymousRead.status,
              completed: s.observed.anonymousRead.body.includes('Completed'),
            },
            metadata: [s.observed.metadataRoot, s.observed.metadataPath],
          }).toEqual({
            wrongAudience: { status: 401, carriesResourceMetadata: true },
            missingWrite: { status: 403, insufficientScope: true },
            anonymousRead: { status: 200, completed: true },
            metadata: [MCP_RESOURCE_URL, MCP_RESOURCE_URL],
          })
        ),
      ),
    )
  })
