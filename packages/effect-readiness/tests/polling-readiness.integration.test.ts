import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Duration, Effect, Fiber, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { type DialMode, ProbeHarness, probeHarness } from './__fixtures__/probe-harness.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080
const TIGHT_WAIT = { timeoutMs: 300, pollMs: 25 } as const

const target = Readiness.target([{ guest: GUEST_PORT, host: '127.0.0.1', hostPort: 1 }], TIGHT_WAIT)

const awaitOver = target.awaitCondition(Readiness.Wait.forTcp(GUEST_PORT))

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
        Then('the check reports the service ready after the mapped port saw exactly one connection attempt')(
          (state, expect) =>
            expect({ verdict: state.outcome.verdict, attempts: state.outcome.attempts }).toMatchObject({
              verdict: { _tag: 'Satisfied' },
              attempts: 1,
            }),
        ),
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
        Then('the check gives up as TimedOut after the mapped port saw more than one connection attempt')(
          (state, expect) =>
            expect({ verdict: state.outcome.verdict, attempts: state.outcome.attempts }).toMatchObject({
              verdict: { _tag: 'TimedOut' },
              attempts: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(1)))),
            }),
        ),
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
        Then('the check gives up as TimedOut after the mapped port saw exactly one connection attempt')(
          (state, expect) =>
            expect({ verdict: state.outcome.verdict, attempts: state.outcome.attempts }).toMatchObject({
              verdict: { _tag: 'TimedOut' },
              attempts: 1,
            }),
        ),
      ),
    )

    scenario(
      'A wait shortened on an already built target gives up at the shortened deadline',
      Gherkin.Do.pipe(
        Given('a guest service that refuses every connection on its mapped port')(() => answerWith('refused')),
        When('the target is shortened to give up after 100 millis and checked for connection acceptance')(
          'outcome',
          () =>
            Effect.gen(function*() {
              const shortened = target.withTimeout(100).withPoll(20)
              const checking = yield* Effect.forkChild(shortened.awaitCondition(Readiness.Wait.forTcp(GUEST_PORT)))
              yield* Effect.yieldNow
              yield* TestClock.adjust(Duration.millis(150))
              const verdict = yield* Fiber.join(checking)
              return { verdict, attempts: yield* dialCount }
            }),
        ),
        Then('the shortened check retried the connection before giving up as TimedOut')(
          (state, expect) =>
            expect({ verdict: state.outcome.verdict, attempts: state.outcome.attempts }).toMatchObject({
              verdict: { _tag: 'TimedOut' },
              attempts: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(1)))),
            }),
        ),
      ),
    )
  })
