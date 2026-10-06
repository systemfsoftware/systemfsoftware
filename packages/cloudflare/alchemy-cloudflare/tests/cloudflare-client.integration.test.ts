import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { afterAll } from '@systemfsoftware/vitest'
import { Duration, Effect, Layer, Match, Option, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { cloudflareEdge } from './__fixtures__/cloudflare-edge.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const ZONE = 'fedcba9876543210fedcba9876543210'
const TOKEN = 'integration-test-token'

const envelope = (code: number, message: string): string =>
  JSON.stringify({ success: false, errors: [{ code, message }] })

// Hand-written from Cloudflare's client-v4 envelope; never produced by the client.
const EMPTY_NAMESPACES = JSON.stringify({ errors: [], messages: [], success: true, result: [] })
const RATE_LIMITED = envelope(1000, 'rate limited')
const NOT_FOUND = envelope(1003, 'namespace not found')
const KV_TAKEN = envelope(10014, 'namespace already exists')
const SINK_DUPLICATE = envelope(1003, 'sink already exists')
const VALIDATION_INVALID = envelope(1003, 'bad request')

const edge = await Effect.runPromise(cloudflareEdge)

afterAll(() => Effect.runPromise(edge.close))

// The whole wiring for the feature, built once at module scope.
const edgeLayer = Layer.mergeAll(
  client.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  Layer.succeed(
    Credentials,
    Effect.succeed(apiTokenCredentials({ apiToken: TOKEN, apiBaseUrl: edge.baseUrl })),
  ),
)

const listNamespaces = Effect.flatMap(
  client.CloudflareClient,
  (api) => api['Workers KV Namespace'].workersKvNamespaceListNamespaces({ params: { account_id: ACCOUNT }, query: {} }),
)

const createNamespace = Effect.flatMap(
  client.CloudflareClient,
  (api) =>
    api['Workers KV Namespace'].workersKvNamespaceCreateANamespace({
      params: { account_id: ACCOUNT },
      payload: { title: 'taken' },
    }),
)

const telemetryQuery = Effect.flatMap(
  client.CloudflareClient,
  (api) =>
    api['Query run'].telemetryQuery({
      params: { account_id: ACCOUNT },
      payload: { queryId: 'ad-hoc', timeframe: { from: 0, to: 1 } },
    }),
)

const tracingRules = Effect.flatMap(
  client.CloudflareClient,
  (api) => api['Observability'].zoneObservabilityTracingRulesGet({ params: { zone_id: ZONE } }),
)

const listDestinations = Effect.flatMap(
  client.CloudflareClient,
  (api) => api['Destinations'].destinationList({ params: { account_id: ACCOUNT }, query: {} }),
)

const createSink = Effect.flatMap(
  client.CloudflareClient,
  (api) =>
    api['workers_pipelines_other'].postV4AccountsByAccountIdPipelinesV1Sinks({
      params: { account_id: ACCOUNT },
      payload: { name: 'duplicate-sink', type: 'r2' },
    }),
)

// The effect's error channel is wider than the package's own errors (a transport
// failure, a credentials failure), so the flipped error is decoded back into the
// published `CloudflareError` union; anything outside it is unmatched.
const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) =>
    Option.match(Schema.decodeUnknownOption(client.CloudflareError)(error), {
      onNone: () => ({ _tag: 'Unrecognised' }),
      onSome: (failure) =>
        Match.value(failure).pipe(
          Match.tag('NotFound', (e) => ({ _tag: 'NotFound', code: e.code, message: e.message })),
          Match.tag('AlreadyExists', (e) => ({ _tag: 'AlreadyExists', code: e.code, message: e.message })),
          Match.tag('Validation', (e) => ({ _tag: 'Validation', code: e.code, message: e.message })),
          Match.tag('RateLimited', (e) => ({
            _tag: 'RateLimited',
            code: e.code,
            message: e.message,
            retryAfterSeconds: Duration.toSeconds(e.retryAfter),
          })),
          Match.tag('Entitlement', (e) => ({ _tag: 'Entitlement', code: e.code, message: e.message })),
          Match.tag('CloudflareApiError', (e) => ({
            _tag: 'CloudflareApiError',
            status: e.status,
            code: e.code,
            message: e.message,
          })),
          Match.exhaustive,
        ),
    }))

Feature('Calling a Cloudflare API over the credential seam')
  .live('drives a real loopback edge with the real FetchHttpClient and the generated client')
  .withLayer(edgeLayer)
  .body(({ scenario }) => {
    scenario(
      'A successful call carries the bearer token and decodes the envelope',
      Gherkin.Do.pipe(
        Given('an edge that answers with an empty namespace list')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 200, body: EMPTY_NAMESPACES, headers: {} }))),
        ),
        When('the namespaces are listed')('response', () => listNamespaces),
        Then('the list is empty and the request reached the edge with the bearer token')((s, expect) =>
          expect({ response: s.response, requests: edge.seen }).toEqual({
            response: { errors: [], messages: [], success: true, result: [] },
            requests: [{
              method: 'GET',
              url: `/accounts/${ACCOUNT}/storage/kv/namespaces`,
              authorization: `Bearer ${TOKEN}`,
            }],
          })
        ),
      ),
    )

    scenario(
      'A missing namespace comes back as not found',
      Gherkin.Do.pipe(
        Given('an edge that answers 404 with a missing-resource envelope')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 404, body: NOT_FOUND, headers: {} }))),
        ),
        When('the namespaces are listed and the call fails')('failure', () => failureOf(listNamespaces)),
        Then('the failure is not found and the edge was asked once')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'NotFound', code: 1003, message: 'namespace not found' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A KV taken-title refusal is an already-existing namespace, not an entitlement',
      Gherkin.Do.pipe(
        Given('an edge that answers 400 with the taken-title code 10014')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 400, body: KV_TAKEN, headers: {} }))),
        ),
        When('a namespace is created and the call fails')('failure', () => failureOf(createNamespace)),
        Then('the failure is an already-existing namespace')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'AlreadyExists', code: 10014, message: 'namespace already exists' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A telemetry query 400/1003 is a validation failure, not an already-exists',
      Gherkin.Do.pipe(
        Given('an edge that answers 400 with the code 1003')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 400, body: VALIDATION_INVALID, headers: {} }))),
        ),
        When('a telemetry query runs and the call fails')('failure', () => failureOf(telemetryQuery)),
        Then('the failure is a validation failure')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'Validation', code: 1003, message: 'bad request' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A zone tracing 400/1003 is a validation failure',
      Gherkin.Do.pipe(
        Given('an edge that answers 400 with the code 1003')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 400, body: VALIDATION_INVALID, headers: {} }))),
        ),
        When('the zone tracing rules are read and the call fails')('failure', () => failureOf(tracingRules)),
        Then('the failure is a validation failure')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'Validation', code: 1003, message: 'bad request' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'An observability destination 400/1003 is a validation failure',
      Gherkin.Do.pipe(
        Given('an edge that answers 400 with the code 1003')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 400, body: VALIDATION_INVALID, headers: {} }))),
        ),
        When('the destinations are listed and the call fails')('failure', () => failureOf(listDestinations)),
        Then('the failure is a validation failure')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'Validation', code: 1003, message: 'bad request' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A pipelines sink duplicate code is an already-existing sink',
      Gherkin.Do.pipe(
        Given('an edge that answers 400 with the duplicate sink code 1003')(
          'edge',
          () => Effect.sync(() => edge.script(() => ({ status: 400, body: SINK_DUPLICATE, headers: {} }))),
        ),
        When('a sink is created and the call fails')('failure', () => failureOf(createSink)),
        Then('the failure is an already-existing sink')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'AlreadyExists', code: 1003, message: 'sink already exists' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A code absent from the family falls back to the status class',
      Gherkin.Do.pipe(
        Given('an edge that answers a telemetry 400 with the uncited code 9999')(
          'edge',
          () =>
            Effect.sync(() =>
              edge.script(() => ({ status: 400, body: envelope(9999, 'a toaster fell over'), headers: {} }))
            ),
        ),
        When('a telemetry query runs and the call fails')('failure', () => failureOf(telemetryQuery)),
        Then('the failure falls back to a validation failure')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'Validation', code: 9999, message: 'a toaster fell over' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A failure without an envelope is reported with its status',
      Gherkin.Do.pipe(
        Given('an edge that answers 500 with a plain-text body')('edge', () =>
          Effect.sync(() =>
            edge.script(() => ({
              status: 500,
              body: 'upstream exploded',
              headers: { 'content-type': 'text/plain' },
            }))
          )),
        When('the namespaces are listed and the call fails')('failure', () => failureOf(listNamespaces)),
        Then('the failure carries the status and no classification, asked once')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'CloudflareApiError', status: 500, code: 0, message: 'HTTP 500' },
            requestCount: 1,
          })
        ),
      ),
    )

    scenario(
      'A throttled call is retried and then succeeds',
      Gherkin.Do.pipe(
        Given('an edge that throttles the first call and then answers')(
          'edge',
          () =>
            Effect.sync(() =>
              edge.script((count) =>
                count === 1
                  ? { status: 429, body: RATE_LIMITED, headers: { 'retry-after': '0' } }
                  : { status: 200, body: EMPTY_NAMESPACES, headers: {} }
              )
            ),
        ),
        When('the namespaces are listed')('response', () => listNamespaces),
        Then('the list is empty after one retry')((s, expect) =>
          expect({ response: s.response, requestCount: edge.seen.length }).toEqual({
            response: { errors: [], messages: [], success: true, result: [] },
            requestCount: 2,
          })
        ),
      ),
    )

    scenario(
      'A call throttled three times gives up as rate limited',
      Gherkin.Do.pipe(
        Given('an edge that throttles every call')(
          'edge',
          () =>
            Effect.sync(() =>
              edge.script(() => ({ status: 429, body: RATE_LIMITED, headers: { 'retry-after': '0' } }))
            ),
        ),
        When('the namespaces are listed and the call fails')('failure', () => failureOf(listNamespaces)),
        Then('the failure is rate limited after three attempts')((s, expect) =>
          expect({ failure: s.failure, requestCount: edge.seen.length }).toEqual({
            failure: { _tag: 'RateLimited', code: 1000, message: 'rate limited', retryAfterSeconds: 0 },
            requestCount: 3,
          })
        ),
      ),
    )
  })
