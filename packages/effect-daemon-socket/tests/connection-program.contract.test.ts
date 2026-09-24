import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, Stream } from 'effect'
import { expect } from 'vitest'
import { observeSocketChild } from './__fixtures__/socket-supervision.fixture.js'

const Feature = makeFeature({ it, layer })

const Environment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

const ECHOED_FRAME = 'child-echoes-what-it-heard'

const echoOf = (connection: SocketMedium.SocketConnection): Effect.Effect<void, never, never> =>
  Effect.orDie(Stream.runForEach(connection.frames, () => connection.send(ECHOED_FRAME)))

Feature('Running the program over the live connection')
  .liveClock()
  .withLayer(Environment)
  .body(({ scenario }) => {
    scenario(
      'The program reads the frames its peer sends and writes back over the same connection',
      Gherkin.Do.pipe(
        Given('a program that writes back a frame for every frame its peer sends')(
          'run',
          () => Effect.succeed(echoOf),
        ),
        When('the supervisor runs the child while its peer greets it')(
          'observation',
          ({ run }) =>
            observeSocketChild({
              child: { restartType: 'temporary', startTimeoutMillis: 1_000 },
              program: (fixture) => ({ address: fixture.address, ready: fixture.ready, run }),
              drive: (session) =>
                Effect.andThen(
                  session.advance({ _tag: 'BecomeReady' }),
                  Effect.andThen(
                    session.awaitFrames(1),
                    Effect.andThen(session.awaitReady, session.shutdown),
                  ),
                ),
            }),
        ),
        Then('the peer receives the frame the program wrote back')(({ observation }) => {
          expect(observation.receivedFrames).toContain(ECHOED_FRAME)
        }),
        And('the child was ready on the connection it wrote over')(({ observation }) => {
          expect(observation.ready).toBe(1)
        }),
      ),
    )
  })
