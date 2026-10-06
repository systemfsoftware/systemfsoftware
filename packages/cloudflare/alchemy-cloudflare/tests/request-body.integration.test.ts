import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect, Layer, Match, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { cloudflareEdge } from './__fixtures__/cloudflare-edge.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const SCAN = { url: 'https://example.com/', agentReadiness: true }

const edge = await Effect.runPromise(cloudflareEdge)

afterAll(() => Effect.runPromise(edge.close))

const edgeLayer = Layer.mergeAll(
  client.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  Layer.succeed(Credentials, Effect.succeed(apiTokenCredentials({ apiToken: 'token', apiBaseUrl: edge.baseUrl }))),
)
// The edge refuses the call and echoes the body it received as the error message,
// so the client's Validation error carries exactly what went over the wire.
const submitScan = Effect.flatMap(
  client.CloudflareClient,
  (api) =>
    api['URL Scanner'].urlscannerCreateScanV2({ params: { account_id: ACCOUNT }, payload: SCAN }).pipe(
      Effect.flip,
      Effect.map((error) =>
        Match.value(error).pipe(
          Match.tag('Validation', (failure) => failure.message),
          Match.orElse(() => 'unexpected failure'),
        )
      ),
      Effect.flatMap((sent) =>
        Schema.decodeEffect(
          Schema.fromJsonString(Schema.Struct({ url: Schema.String, agentReadiness: Schema.Boolean })),
        )(sent)
      ),
    ),
)

Feature('Sending a request body Cloudflare requires')
  .live('drives a real loopback edge with the real FetchHttpClient and the generated client')
  .withLayer(edgeLayer)
  .body(({ scenario }) => {
    scenario(
      'A URL scan submission carries its JSON body',
      Gherkin.Do.pipe(
        Given('an edge that refuses every call with the body it received as the message')(
          'edge',
          () =>
            Effect.sync(() =>
              edge.script((_count, body) => ({
                status: 400,
                body: JSON.stringify({ success: false, errors: [{ code: 1000, message: body }] }),
                headers: {},
              }))
            ),
        ),
        When('a scan of a URL is submitted')('answer', () => submitScan),
        Then('the edge received the submission as JSON')((s, expect) => expect(s.answer).toEqual(SCAN)),
      ),
    )
  })
