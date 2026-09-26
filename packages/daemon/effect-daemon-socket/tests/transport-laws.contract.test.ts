import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { runLaws, type SocketTransport, transportLaws } from './__fixtures__/transport-laws.fixture.js'

const Feature = makeFeature({ it })

const realLoopback: SocketTransport = {
  dialer: SocketMedium.nodeDialer,
  listener: SocketMedium.nodeLoopbackListener,
}

Feature('The laws the real loopback transport keeps')
  .withLayer(Layer.empty)
  .live('the real transport binds a loopback listener and dials it over TCP in this process')
  .body(({ scenario }) => {
    scenario(
      'Every law the transport must keep holds against the real loopback transport',
      Gherkin.Do.pipe(
        Given('the laws a socket transport must keep')('laws', () => Effect.succeed(transportLaws)),
        When('every law runs against the real loopback transport')('verdicts', () => runLaws(realLoopback)),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(s.laws.map((law) => `${law.name}: holds`))),
      ),
    )
  })
