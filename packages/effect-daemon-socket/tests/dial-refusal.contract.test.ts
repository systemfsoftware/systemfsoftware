import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Layer } from 'effect'
import {
  awaitTerminationThenShutdown,
  closedLoopbackAddress,
  exitSignalsOf,
  observeSocketChild,
  terminationTagsOf,
} from './__fixtures__/socket-supervision.fixture.js'

const Feature = makeFeature({ it })

const Environment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

Feature('Refusing a connection nothing accepts')
  .live('a dial to a real loopback port with nothing listening is refused by the operating system')
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
        Then('the child is refused rather than left waiting, naming the operating system error the dial raised')(
          (state, expect) =>
            expect({
              ready: state.observation.ready,
              terminationTags: terminationTagsOf(state.observation.reasons),
              exitSignals: exitSignalsOf(state.observation.reasons),
            }).toMatchObject({
              ready: 0,
              terminationTags: ['Abnormal'],
              exitSignals: ['ECONNREFUSED'],
            }),
        ),
      ),
    )
  })
