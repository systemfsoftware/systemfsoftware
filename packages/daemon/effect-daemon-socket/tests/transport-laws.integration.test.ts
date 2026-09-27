import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { memoryTransport } from './__fixtures__/memory-transport.fixture.js'
import { runLaws, type SocketTransport, transportLaws } from './__fixtures__/transport-laws.fixture.js'

const Feature = makeFeature({ it })

const liveReason =
  'the laws poll a live connection and judge how its scope closes, which the simulation kernel does not model'

/**
 * The in-memory peer a socket stop check substitutes for the outside system,
 * plugged into the same laws the real loopback transport keeps. Both ports come
 * from one peer, because the fake plays both sides of the connection.
 */
const inMemoryTransport: Effect.Effect<SocketTransport> = Effect.map(
  memoryTransport,
  (peer): SocketTransport => ({ dialer: peer, listener: peer }),
)

Feature('The laws an in-memory socket peer keeps')
  .withLayer(Layer.empty)
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'Every law the transport must keep holds against the in-memory peer',
      Gherkin.Do.pipe(
        Given('the laws a socket transport must keep')('laws', () => Effect.succeed(transportLaws)),
        When('every law runs against the in-memory transport')(
          'verdicts',
          () => Effect.flatMap(inMemoryTransport, runLaws),
        ),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(s.laws.map((law) => `${law.name}: holds`))),
      ),
    )
  })
