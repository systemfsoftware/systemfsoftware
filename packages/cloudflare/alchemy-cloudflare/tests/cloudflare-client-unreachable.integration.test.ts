import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Match } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { closedBaseUrl } from './__fixtures__/cloudflare-edge.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'

const refusedBaseUrl = await Effect.runPromise(closedBaseUrl)

const refusedLayer = Layer.mergeAll(
  client.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  Layer.succeed(
    Credentials,
    Effect.succeed(apiTokenCredentials({ apiToken: 'unused-token', apiBaseUrl: refusedBaseUrl })),
  ),
)

const listNamespaces = Effect.flatMap(
  client.CloudflareClient,
  (api) => api['Workers KV Namespace'].workersKvNamespaceListNamespaces({ params: { account_id: ACCOUNT }, query: {} }),
)

// A transport failure has no HTTP status, so the client reports status 0; the
// message comes from the platform and is asserted only to be text. Anything the
// client did not classify into `CloudflareApiError` falls to an unmatched shape.
const observedFailure = Effect.map(Effect.flip(listNamespaces), (error) =>
  Match.value(error).pipe(
    Match.tag('CloudflareApiError', (failure) => ({
      _tag: 'CloudflareApiError',
      status: failure.status,
      code: failure.code,
      messageIsText: typeof failure.message === 'string',
    })),
    Match.orElse(() => ({ _tag: 'Unrecognised' })),
  ))

Feature('Calling a Cloudflare API that cannot be reached')
  .live('dials a closed loopback port with the real FetchHttpClient')
  .withLayer(refusedLayer)
  .body(({ scenario }) => {
    scenario(
      'An unreachable edge is reported as an API failure with no status',
      Gherkin.Do.pipe(
        Given('a Cloudflare edge that is not listening')('edge', () => Effect.succeed('unreachable')),
        When('the namespaces are listed and the transport fails')('failure', () => observedFailure),
        Then('the failure is an API failure with status zero')((s, expect) =>
          expect(s.failure).toEqual({
            _tag: 'CloudflareApiError',
            status: 0,
            code: 0,
            messageIsText: true,
          })
        ),
      ),
    )
  })
