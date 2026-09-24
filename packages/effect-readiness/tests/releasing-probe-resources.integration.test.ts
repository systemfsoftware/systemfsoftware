import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Option } from 'effect'
import { GuestService } from './__fixtures__/guest-service.fixture.js'
import { scenarioEnvironment } from './__fixtures__/readiness-environment.fixture.js'

const Feature = makeFeature({ it })

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

Feature('Releasing every probe connection after repeated readiness checks')
  .live('scenarios open real loopback sockets to a real guest service the kernel cannot observe')
  .withScenarioLayer(scenarioEnvironment)
  .body(({ scenario }) => {
    scenario(
      'Twenty checks in a row leave nothing behind for the service shutdown',
      Gherkin.Do.pipe(
        Given('a guest service deployed on mapped port 8080')('target', () => targetOfMappedGuest),
        When('readiness is checked twenty times in a row before the service shuts down')(
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
        Then('the service shuts down at once with no connection still held')(
          ({ completionStatus }) => {
            expect(completionStatus).toSatisfy(Option.isSome)
          },
        ),
      ),
    )
  })
