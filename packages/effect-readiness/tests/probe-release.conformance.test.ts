import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Match } from 'effect'
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

const passRuns = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new Error(
        `expected the service to release every stopped probe, but the check read: ${Conformance.render(report)}`,
      )
    }),
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
        Then('the service reports no connection left open')((s) => {
          passRuns(s.checked)
        }),
        And('the service saw the wait connect at least once')((s) => {
          if (s.service.accepted() === 0) {
            throw new Error('the service never saw the wait connect, so the release proves nothing')
          }
        }),
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
        Then('the service reports no connection left open')((s) => {
          passRuns(s.checked)
        }),
        And('the service saw the wait connect at least once')((s) => {
          if (s.service.accepted() === 0) {
            throw new Error('the service never saw the wait connect, so the release proves nothing')
          }
        }),
      ),
    )
  })
