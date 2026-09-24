import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Layer } from 'effect'
import { expect } from 'vitest'
import {
  awaitTerminationThenShutdown,
  closedLoopbackAddress,
  exitSignalsOf,
  observeSocketChild,
  terminationTagsOf,
} from './__fixtures__/socket-supervision.fixture.js'

const Feature = makeFeature({ it, layer })

const Environment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

Feature('Refusing a connection nothing accepts')
  .liveClock()
  .withLayer(Environment)
  .body(({ scenario }) => {
    scenario(
      'A dial to a closed loopback port is refused instead of waiting for the start deadline',
      Gherkin.Do.pipe(
        Given('a loopback address with nothing listening on it')('address', () => closedLoopbackAddress),
        When('a supervisor runs a socket child against it')(
          'observation',
          ({ address }) =>
            observeSocketChild({
              child: { restartType: 'temporary', startTimeoutMillis: 250 },
              program: (fixture) => ({ address, ready: fixture.ready }),
              drive: awaitTerminationThenShutdown,
            }),
        ),
        Then('the child is reported as terminated rather than left waiting for readiness')(({ observation }) => {
          expect(observation.ready).toBe(0)
          expect(terminationTagsOf(observation.reasons)).toEqual(['Abnormal'])
          expect(exitSignalsOf(observation.reasons)).not.toEqual(['DeadlineMissed'])
        }),
        And('the refusal names the operating system error the dial raised')(({ observation }) => {
          expect(exitSignalsOf(observation.reasons)).toEqual(['ECONNREFUSED'])
        }),
      ),
    )
  })
