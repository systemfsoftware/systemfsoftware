import { captureCloudflare } from '@systemfsoftware/cloudflare-capture'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { ConfigProvider, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { writeFixture } from './__fixtures__/fixture-file.js'

const Feature = makeFeature({ it })

Feature('Recording the real Cloudflare answers the published sources leave uncited')
  .live('reaches the real Cloudflare API and writes the committed fixture')
  .withLayer(Layer.mergeAll(FetchHttpClient.layer, ConfigProvider.layer(ConfigProvider.fromEnv())))
  .body(({ scenario }) => {
    scenario(
      'A live run captures every catalogued error and writes the fixture',
      Gherkin.Do.pipe(
        Given(
          'the capture lane reading its secrets from the environment',
        )('run', () => captureCloudflare()),
        When(
          'every case has answered and the fixture is written',
        )('written', (s) => writeFixture(s.run)),
        Then(
          'the fixture holds one error answer per catalogued case',
        )((s, expect) =>
          expect([
            s.run.records.filter((record) => record.status < 400),
            s.written === s.run.records.length,
            s.written > 0,
          ]).toEqual([[], true, true])
        ),
      ),
    )
  })
