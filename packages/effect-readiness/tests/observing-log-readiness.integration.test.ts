import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Duration, Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import {
  DynamicLogStream,
  dynamicScenarioEnvironment,
  unreadableLogEnvironment,
} from './__fixtures__/readiness-environment.fixture.js'

const Feature = makeFeature({ it })

const TIGHT_WAIT = { timeoutMs: 400, pollMs: 25 } as const

const target = Readiness.target([], TIGHT_WAIT)

const awaitOver = (condition: Readiness.Condition) => target.awaitCondition(condition)

Feature('Observing guest log output for readiness')
  .withScenarioLayer(dynamicScenarioEnvironment([]))
  .body(({ scenario }) => {
    scenario(
      'A log line appearing after polling begins satisfies the readiness wait',
      Gherkin.Do.pipe(
        Given('a guest service starting with an initially empty log stream')(
          'target',
          () => Effect.succeed(target),
        ),
        When('readiness is checked while a starting service writes its ready line after a delay')(
          'verdict',
          () =>
            Effect.gen(function*() {
              const checking = yield* Effect.forkChild(
                Effect.flatMap(DynamicLogStream, (stream) =>
                  Effect.delay(
                    stream.append('2026-09-22T01:00:00Z [info] worker ready on port 8080'),
                    '50 millis',
                  )),
              )
              const waiting = yield* Effect.forkChild(awaitOver(Readiness.Wait.forLog('worker ready on port 8080')))
              yield* TestClock.adjust(Duration.millis(400))
              yield* Fiber.join(checking)
              const verdict = yield* Fiber.join(waiting)
              yield* TestClock.adjust(Duration.millis(100))
              return verdict
            }),
        ),
        Then('the check reports the service is ready')((state, expect) =>
          expect(state.verdict).toMatchObject({ _tag: 'Satisfied' })
        ),
      ),
    )

    scenario(
      'Multiline log entries with surrounding formatting match the target pattern accurately',
      Gherkin.Do.pipe(
        Given('a guest service that printed complex multiline stack traces and banner text')(
          'stream',
          () =>
            Effect.gen(function*() {
              const stream = yield* DynamicLogStream
              yield* stream.append('--- SYSTEM BOOT ---\nInitializing modules...\nConfig: { "env": "prod" }')
              yield* stream.append('[SUCCESS] Ready for traffic: https://0.0.0.0:8080/v1\nHandling events...')
            }),
        ),
        When('readiness is checked for the service address line amid boot and banner text')(
          'verdict',
          () => awaitOver(Readiness.Wait.forLog('Ready for traffic: https://0.0.0.0:8080/v1')),
        ),
        Then('the check reports the service is ready')((state, expect) =>
          expect(state.verdict).toMatchObject({ _tag: 'Satisfied' })
        ),
      ),
    )

    scenario(
      'A log stream containing non-matching lines times out without false positives',
      Gherkin.Do.pipe(
        Given('a guest service printing heartbeat entries that do not match the expected pattern')(
          'stream',
          () =>
            Effect.gen(function*() {
              const stream = yield* DynamicLogStream
              yield* stream.append('heartbeat tick 1')
              yield* stream.append('heartbeat tick 2')
            }),
        ),
        When('readiness is checked for a line the heartbeats never print')(
          'verdict',
          () =>
            Effect.gen(function*() {
              const waiting = yield* Effect.forkChild(awaitOver(Readiness.Wait.forLog('service fully operational')))
              yield* TestClock.adjust(Duration.millis(400))
              return yield* Fiber.join(waiting)
            }),
        ),
        Then('the check gives up reporting the service is not ready')((state, expect) =>
          expect(state.verdict).toMatchObject({ _tag: 'TimedOut' })
        ),
      ),
    )

    scenario(
      'A log stream that cannot be read fails the readiness check',
      { scenarioLayer: unreadableLogEnvironment(new Readiness.LogSourceError({ source: 'guest' })) },
      Gherkin.Do.pipe(
        Given('a guest service whose log stream produces a read failure')(
          'target',
          () => Effect.succeed(target),
        ),
        When('readiness is checked for the word the broken stream should contain')(
          'outcome',
          () => awaitOver(Readiness.Wait.forLog('listening')).pipe(Effect.flip),
        ),
        Then('the check reports the broken stream as the reason')((state, expect) =>
          expect(state.outcome).toMatchObject({ _tag: 'LogSourceError' })
        ),
      ),
    )
  })
