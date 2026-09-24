import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer } from 'effect'
import { driveScript, observeSocketChild } from './__fixtures__/socket-supervision.fixture.js'

const Feature = makeFeature({ it })

const Environment = Layer.provideMerge(
  SocketMedium.layer({ readyPollMillis: 5 }),
  Readiness.NodeHostProber.layer,
)

Feature('Releasing the connection a stopped child held')
  .live('a real loopback peer holds the connection a stopped child has to give back')
  .withLayer(Environment)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A <mode> stop leaves the peer holding no connection to the child',
      [
        { mode: 'graceful', shutdown: { _tag: 'Graceful', millis: 200 } },
        { mode: 'brutal', shutdown: { _tag: 'Brutal' } },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a supervised child whose peer has greeted it')(
            'script',
            () => Effect.succeed([{ _tag: 'BecomeReady' }] as const),
          ),
          When('the supervisor stops the child in <mode> mode')(
            'observation',
            ({ script }) =>
              observeSocketChild({
                child: { restartType: 'temporary', shutdown: row.shutdown, startTimeoutMillis: 1_000 },
                program: (fixture) => ({ address: fixture.address, ready: fixture.ready }),
                drive: driveScript(script),
              }),
          ),
          Then('the peer holds no connection to the child')((state, expect) =>
            expect({
              ready: state.observation.ready,
              openConnections: state.observation.openConnections,
            }).toEqual({ ready: 1, openConnections: 0 })
          ),
        ),
    )
  })
