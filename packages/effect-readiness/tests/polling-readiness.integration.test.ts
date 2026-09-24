import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Duration, Effect, Fiber, Match } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { type DialMode, ProbeHarness, probeHarness } from './__fixtures__/probe-harness.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080
const TIGHT_WAIT = { timeoutMs: 300, pollMs: 25 } as const

const target = Readiness.target([{ guest: GUEST_PORT, host: '127.0.0.1', hostPort: 1 }], TIGHT_WAIT)

const awaitOver = Readiness.awaitCondition(target, Readiness.Wait.forTcp(GUEST_PORT))

const reportedReady = (verdict: Readiness.Satisfied | Readiness.TimedOut): boolean =>
  Match.value(verdict).pipe(
    Match.tag('Satisfied', () => true),
    Match.tag('TimedOut', () => false),
    Match.exhaustive,
  )

const dialCount = Effect.flatMap(ProbeHarness, (harness) => harness.dials)

const answerWith = (behaviour: DialMode) => Effect.flatMap(ProbeHarness, (harness) => harness.answerWith(behaviour))

Feature('Waiting for a guest service to answer before the check gives up')
  .withScenarioLayer(probeHarness)
  .body(({ scenario }) => {
    scenario(
      'A service that answers on the first attempt satisfies the wait without further probing',
      Gherkin.Do.pipe(
        Given('a guest service that accepts connections on its mapped port')(() => answerWith('connected')),
        When('readiness is checked for connection acceptance')(
          'outcome',
          () => Effect.zipWith(awaitOver, dialCount, (verdict, attempts) => ({ verdict, attempts })),
        ),
        Then('the check reports the service is ready')(({ outcome }) => {
          expect(reportedReady(outcome.verdict)).toBe(true)
        }),
        And('the mapped port saw exactly one connection attempt')(({ outcome }) => {
          expect(outcome.attempts).toBe(1)
        }),
      ),
    )

    scenario(
      'A service that refuses every attempt gives up at the deadline',
      Gherkin.Do.pipe(
        Given('a guest service that refuses every connection on its mapped port')(() => answerWith('refused')),
        When('readiness is checked for connection acceptance')('outcome', () =>
          Effect.gen(function*() {
            const checking = yield* Effect.forkChild(awaitOver)
            yield* Effect.flatMap(ProbeHarness, (harness) => harness.enteredDial)
            yield* TestClock.adjust(Duration.millis(400))
            const verdict = yield* Fiber.join(checking)
            return { verdict, attempts: yield* dialCount }
          })),
        Then('the check gives up reporting the service is not ready')(({ outcome }) => {
          expect(reportedReady(outcome.verdict)).toBe(false)
        }),
        And('the mapped port saw more than one connection attempt')(({ outcome }) => {
          expect(outcome.attempts).toBeGreaterThan(1)
        }),
      ),
    )

    scenario(
      'A service whose connections never complete gives up at the deadline',
      Gherkin.Do.pipe(
        Given('a guest service whose connections never complete')(() => answerWith('hang')),
        When('readiness is checked for connection acceptance')('outcome', () =>
          Effect.gen(function*() {
            const checking = yield* Effect.forkChild(awaitOver)
            yield* Effect.flatMap(ProbeHarness, (harness) => harness.enteredDial)
            yield* TestClock.adjust(Duration.millis(400))
            const verdict = yield* Fiber.join(checking)
            return { verdict, attempts: yield* dialCount }
          })),
        Then('the check gives up reporting the service is not ready')(({ outcome }) => {
          expect(reportedReady(outcome.verdict)).toBe(false)
        }),
        And('the mapped port saw exactly one connection attempt')(({ outcome }) => {
          expect(outcome.attempts).toBe(1)
        }),
      ),
    )
  })
