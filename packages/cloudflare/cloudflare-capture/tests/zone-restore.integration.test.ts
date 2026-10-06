import { captureCloudflare } from '@systemfsoftware/cloudflare-capture'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { ConfigProvider, Effect, Layer, Result } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { scriptCaptureRun } from './__fixtures__/capture-run-edge.fixture.js'
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

Feature('Leaving the production zone tracing settings as they were found')
  .live('a scripted Cloudflare edge on a real loopback socket')
  .withLayer(captureLayer)
  .body(({ scenario }) => {
    scenario(
      'The run restores the settings exactly when the API accepts the restore',
      Gherkin.Do.pipe(
        Given(
          'a Cloudflare that applies the restore',
        )('edge', () =>
          Effect.sync(() => {
            scriptCaptureRun({ edge })
            return edge
          })),
        When(
          'the capture lane patches the tracing settings',
        )('outcome', (s) => Effect.result(captureCloudflare(s.edge.baseUrl))),
        Then(
          'the run completes without leaving the zone mutated',
        )((s, expect) => expect(s.outcome).toSatisfy(Result.isSuccess, 'the run must restore and succeed')),
      ),
    )
    scenario(
      'The run fails when the API keeps the patched tracing value',
      Gherkin.Do.pipe(
        Given(
          'a Cloudflare that keeps the patched tracing value',
        )('edge', () =>
          Effect.sync(() => {
            scriptCaptureRun({ edge, options: { keepZonePatched: true } })
            return edge
          })),
        When(
          'the capture lane patches the tracing settings',
        )('outcome', (s) => Effect.result(captureCloudflare(s.edge.baseUrl))),
        Then(
          'the run fails rather than leave the zone mutated',
        )((s, expect) =>
          expect(s.outcome).toSatisfy(Result.isFailure, 'the run must refuse to leave the zone mutated')
        ),
      ),
    )
  })
