import { expect } from '@effect/vitest'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer } from 'effect'
import {
  driveScript,
  exitCodesOf,
  exitSignalsOf,
  observeSocketChild,
  terminationTagsOf,
} from './__fixtures__/socket-supervision.fixture.js'

const Feature = makeFeature({ it, layer })

const Environment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

const CLEAN_CLOSE_CODE = 1000

Feature('Reporting how a connection ended')
  .liveClock()
  .withLayer(Environment)
  .body(({ scenario }) => {
    scenario(
      'A peer that ends the connection gracefully terminates the child normally',
      Gherkin.Do.pipe(
        Given('a peer that greets the child and then ends the connection')(
          'script',
          () => Effect.succeed([{ _tag: 'BecomeReady' }, { _tag: 'ExitNormal' }] as const),
        ),
        When('the supervisor runs the child while its peer enacts that script')(
          'observation',
          ({ script }) =>
            observeSocketChild({
              child: { restartType: 'temporary', startTimeoutMillis: 1_000 },
              program: (fixture) => ({ address: fixture.address, ready: fixture.ready }),
              drive: driveScript(script),
            }),
        ),
        Then('the child is reported as normally terminated')(({ observation }) => {
          expect(observation.reasons).toEqual([{ _tag: 'Normal' }])
        }),
        And('the child was ready before its peer ended the connection')(({ observation }) => {
          expect(observation.ready).toBe(1)
        }),
      ),
    )

    scenario(
      'A peer that resets the connection reports the failure the child observed',
      Gherkin.Do.pipe(
        Given('a peer that greets the child and then resets the connection')(
          'script',
          () => Effect.succeed([{ _tag: 'BecomeReady' }, { _tag: 'ExitAbnormal' }] as const),
        ),
        When('the supervisor runs the child while its peer enacts that script')(
          'observation',
          ({ script }) =>
            observeSocketChild({
              child: { restartType: 'temporary', startTimeoutMillis: 1_000 },
              program: (fixture) => ({ address: fixture.address, ready: fixture.ready }),
              drive: driveScript(script),
            }),
        ),
        Then('the child is reported as abnormally terminated')(({ observation }) => {
          expect(terminationTagsOf(observation.reasons)).toEqual(['Abnormal'])
        }),
        And('the report carries a failure that is not an orderly close')(({ observation }) => {
          expect(exitCodesOf(observation.reasons)).not.toEqual([CLEAN_CLOSE_CODE])
          expect(exitSignalsOf(observation.reasons)).toHaveLength(1)
        }),
      ),
    )
  })
