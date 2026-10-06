import { captureCloudflare } from '@systemfsoftware/cloudflare-capture'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { ConfigProvider, Effect, Layer, Result } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { RUN_PREFIX, scriptCaptureRun } from './__fixtures__/capture-run-edge.fixture.js'
import { cloudflareEdge } from './__fixtures__/cloudflare-edge.fixture.js'

const Feature = makeFeature({ it })

const edge = await Effect.runPromise(cloudflareEdge)

const FAKE_ENV = {
  CLOUDFLARE_API_TOKEN: 'fake-token',
  CLOUDFLARE_ACCOUNT_ID: 'abcdef0123456789abcdef0123456789',
  CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
  GITHUB_RUN_ID: '7',
}

const captureLayer = Layer.mergeAll(
  FetchHttpClient.layer,
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: FAKE_ENV })),
)

Feature('Leaving no resource named with the run prefix behind')
  .live('a scripted Cloudflare edge on a real loopback socket')
  .withLayer(captureLayer)
  .body(({ scenario }) => {
    scenario(
      'The run fails when a created resource survives it',
      Gherkin.Do.pipe(
        Given(
          'a Cloudflare still holding one of the run\u2019s streams',
        )('edge', () =>
          Effect.sync(() => {
            scriptCaptureRun({
              edge,
              options: { leakedListing: { urlFragment: '/k2/streams', name: `${RUN_PREFIX}k2` } },
            })
            return edge
          })),
        When(
          'the capture lane finishes every case',
        )('outcome', (s) => Effect.result(captureCloudflare(s.edge.baseUrl))),
        Then(
          'the run fails on the leak rather than pass with the resource left behind',
        )((s, expect) => expect(s.outcome).toSatisfy(Result.isFailure, 'the run must fail on the leaked resource')),
      ),
    )
    scenario(
      'The run succeeds when every created resource is gone',
      Gherkin.Do.pipe(
        Given(
          'a Cloudflare holding none of the run\u2019s resources',
        )('edge', () =>
          Effect.sync(() => {
            scriptCaptureRun({ edge })
            return edge
          })),
        When(
          'the capture lane finishes every case',
        )('outcome', (s) => Effect.result(captureCloudflare(s.edge.baseUrl))),
        Then(
          'the run passes the leak check',
        )((s, expect) => expect(s.outcome).toSatisfy(Result.isSuccess, 'the run must pass')),
      ),
    )
  })
