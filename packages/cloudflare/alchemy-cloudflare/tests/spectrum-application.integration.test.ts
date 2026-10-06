import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { cloudflareEdge } from './__fixtures__/cloudflare-edge.fixture.js'

const Feature = makeFeature({ it })

const ZONE = '023e105f4ecef8ad9ca31a8372d0c353'
const APP = 'ea95132c15732412d22c1476fa83f27a'

// Hand-written from the schema's full application (spectrum-config_app_config):
// every field it requires plus a Worker origin, as the starter deploys it.
const WORKER_APP = {
  id: APP,
  created_on: '2026-10-06T00:00:00Z',
  modified_on: '2026-10-06T00:00:00Z',
  protocol: 'tcp/22',
  dns: { type: 'CNAME', name: 'ssh.example.com' },
  traffic_type: 'worker',
  origin_worker_id: '0123456789abcdef0123456789abcdef',
  edge_ips: { type: 'dynamic', connectivity: 'all' },
  ip_firewall: false,
  proxy_protocol: 'off',
  tls: 'off',
  argo_smart_routing: false,
}

const edge = await Effect.runPromise(cloudflareEdge)

afterAll(() => Effect.runPromise(edge.close))

const edgeLayer = Layer.mergeAll(
  client.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  Layer.succeed(Credentials, Effect.succeed(apiTokenCredentials({ apiToken: 'token', apiBaseUrl: edge.baseUrl }))),
)

const readApplication = Effect.flatMap(
  client.CloudflareClient,
  (api) =>
    api['Spectrum Applications'].spectrumApplicationsGetSpectrumApplicationConfiguration({
      params: { zone_id: ZONE, app_id: APP },
    }),
)

Feature('Reading a Spectrum application through the generated client')
  .live('drives a real loopback edge with the real FetchHttpClient and the generated client')
  .withLayer(edgeLayer)
  .body(({ scenario }) => {
    scenario(
      'A full application with a Worker origin decodes',
      Gherkin.Do.pipe(
        Given('an edge that answers with a Spectrum application routed to a Worker')(
          'edge',
          () =>
            Effect.sync(() =>
              edge.script(() => ({
                status: 200,
                body: JSON.stringify({ success: true, errors: [], messages: [], result: WORKER_APP }),
                headers: {},
              }))
            ),
        ),
        When('the application is read')('response', () => readApplication),
        Then('the client returns the application as Cloudflare sent it')((s, expect) =>
          expect(s.response.result).toEqual(WORKER_APP)
        ),
      ),
    )
  })
