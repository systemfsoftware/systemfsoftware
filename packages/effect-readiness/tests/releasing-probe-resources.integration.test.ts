import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Option } from 'effect'
import { expect } from 'vitest'
import { GuestService } from './__fixtures__/guest-service.fixture.js'
import { scenarioEnvironment } from './__fixtures__/readiness-environment.fixture.js'

const Feature = makeFeature({ it, layer })

const GUEST_PORT = 8080
const TIGHT_WAIT = { timeoutMs: 300, pollMs: 25 } as const

const bindingOf = (hostPort: number): Readiness.PortBinding => ({
  guest: GUEST_PORT,
  host: '127.0.0.1',
  hostPort,
})

const targetOf = (bindings: ReadonlyArray<Readiness.PortBinding>): Readiness.ProbeTargetBlueprint =>
  Readiness.target(bindings, TIGHT_WAIT)

const targetOfMappedGuest = Effect.gen(function*() {
  const guest = yield* GuestService
  return targetOf([bindingOf(guest.hostPort)])
})

const awaitOver = (target: Readiness.ProbeTargetBlueprint, condition: Readiness.Condition) =>
  target.awaitCondition(condition)

Feature('Preventing socket descriptor leaks across repeated checks')
  .liveClock()
  .withScenarioLayer(scenarioEnvironment)
  .body(({ scenario }) => {
    scenario(
      'Repeated connection attempts release all client sockets upon completion',
      Gherkin.Do.pipe(
        Given('a guest service deployed on mapped port 8080')('target', () => targetOfMappedGuest),
        When('readiness is checked across twenty sequential probe attempts')(
          'completionStatus',
          ({ target }) =>
            Effect.gen(function*() {
              const guest = yield* GuestService
              for (let i = 0; i < 20; i++) {
                yield* awaitOver(target, Readiness.Wait.forTcp(GUEST_PORT))
              }
              return yield* Effect.timeoutOption(guest.release, '3 seconds')
            }),
        ),
        Then('host listener shutdown succeeds immediately without waiting on lingering connections')(
          ({ completionStatus }) => {
            expect(Option.isSome(completionStatus)).toBe(true)
          },
        ),
      ),
    )
  })
