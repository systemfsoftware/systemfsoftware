import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Schema } from 'effect'
import { type LoopbackService, loopbackService } from './__fixtures__/loopback-service.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080

const bindingTo = (service: LoopbackService): Readiness.PortBinding => ({
  guest: GUEST_PORT,
  host: '127.0.0.1',
  hostPort: service.port,
})

const connectionAttempt = (service: LoopbackService): Effect.Effect<Readiness.DialEvidence> =>
  Effect.flatMap(Readiness.HostProber, (prober) => prober.dial(bindingTo(service))).pipe(
    Effect.provide(Readiness.NodeHostProber.layer),
  )

const healthExchange = (service: LoopbackService): Effect.Effect<Readiness.HttpEvidence> =>
  Effect.flatMap(Readiness.HostProber, (prober) => prober.exchange(bindingTo(service), '/health')).pipe(
    Effect.provide(Readiness.NodeHostProber.layer),
  )

Feature('Releasing every readiness probe connection when the wait stops early')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A probe stopped while opening a connection leaves nothing open on the service',
      Gherkin.Do.pipe(
        Given('a service listening on a free loopback port')('service', () => loopbackService),
        When('the readiness wait opens a connection and is stopped at every step')(
          'checked',
          (s) => Conformance.released(connectionAttempt(s.service), { probe: s.service.released }),
        ),
        Then('the release run passes and the service saw the wait connect at least once')(
          (state, expect) =>
            expect({ report: state.checked, accepted: state.service.accepted() }, Conformance.render(state.checked))
              .toMatchObject({
                report: { _tag: 'Pass' },
                accepted: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
              }),
        ),
      ),
    )

    scenario(
      'A probe stopped while exchanging a health response leaves nothing open on the service',
      Gherkin.Do.pipe(
        Given('a service listening on a free loopback port')('service', () => loopbackService),
        When('the readiness wait asks for the health path and is stopped at every step')(
          'checked',
          (s) => Conformance.released(healthExchange(s.service), { probe: s.service.released }),
        ),
        Then('the release run passes and the service saw the wait connect at least once')(
          (state, expect) =>
            expect({ report: state.checked, accepted: state.service.accepted() }, Conformance.render(state.checked))
              .toMatchObject({
                report: { _tag: 'Pass' },
                accepted: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
              }),
        ),
      ),
    )
  })
