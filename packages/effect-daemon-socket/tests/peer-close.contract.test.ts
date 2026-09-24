import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer } from 'effect'
import {
  driveScript,
  exitCodesOf,
  exitSignalsOf,
  observeSocketChild,
  terminationTagsOf,
} from './__fixtures__/socket-supervision.fixture.js'

const Feature = makeFeature({ it })

const Environment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

const CLEAN_CLOSE_CODE = 1000

Feature('Reporting how a connection ended')
  .live('a real loopback peer ends and resets the connection the child holds')
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
        Then('the child was ready on the connection its peer then ended, and is reported as normally terminated')(
          (state, expect) =>
            expect({
              reasons: state.observation.reasons,
              ready: state.observation.ready,
            }).toEqual({ reasons: [{ _tag: 'Normal' }], ready: 1 }),
        ),
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
        Then('the child is reported as abnormally terminated with one exit signal that is not an orderly close')(
          (state, expect) =>
            expect({
              terminationTags: terminationTagsOf(state.observation.reasons),
              exitCodes: exitCodesOf(state.observation.reasons),
              exitSignals: exitSignalsOf(state.observation.reasons),
            }).toSatisfy(
              (observed) =>
                observed.terminationTags.length === 1 &&
                observed.terminationTags[0] === 'Abnormal' &&
                !(observed.exitCodes.length === 1 && observed.exitCodes[0] === CLEAN_CLOSE_CODE) &&
                observed.exitSignals.length === 1,
              'the report carries one failure signal and a close code that is not an orderly close',
            ),
        ),
      ),
    )
  })
