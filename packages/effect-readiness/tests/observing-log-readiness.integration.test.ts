import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Match } from 'effect'
import { expect } from 'vitest'
import {
  DynamicLogStream,
  dynamicScenarioEnvironment,
  unreadableLogEnvironment,
} from './__fixtures__/readiness-environment.fixture.js'

const Feature = makeFeature({ it, layer })

const TIGHT_WAIT = { timeoutMs: 400, pollMs: 25 } as const

const target = Readiness.target([], TIGHT_WAIT)

const awaitOver = (condition: Readiness.Condition) => Readiness.awaitCondition(target, condition)

const reportedReady = (verdict: Readiness.Satisfied | Readiness.TimedOut): boolean =>
  Match.value(verdict).pipe(
    Match.tag('Satisfied', () => true),
    Match.tag('TimedOut', () => false),
    Match.exhaustive,
  )

const reportedLogFailure = (error: Readiness.LogSourceError): boolean =>
  Match.value(error).pipe(
    Match.tag('LogSourceError', () => true),
    Match.exhaustive,
  )

Feature('Observing guest log output for readiness')
  .liveClock()
  .withScenarioLayer(dynamicScenarioEnvironment([]))
  .body(({ scenario }) => {
    scenario(
      'A log line appearing after polling begins satisfies the readiness wait',
      Gherkin.Do.pipe(
        Given('a guest service starting with an initially empty log stream')(
          'target',
          () => Effect.succeed(target),
        ),
        When('readiness is checked while a background process emits the log line after a delay')(
          'verdict',
          () =>
            Effect.gen(function*() {
              const stream = yield* DynamicLogStream
              yield* Effect.forkScoped(
                Effect.delay(stream.append('2026-09-22T01:00:00Z [info] worker ready on port 8080'), '50 millis'),
              )
              return yield* awaitOver(Readiness.Wait.forLog('worker ready on port 8080'))
            }),
        ),
        Then('the check reports the service is ready')(({ verdict }) => {
          expect(reportedReady(verdict)).toBe(true)
        }),
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
        When('readiness is checked for exact pattern "Ready for traffic: https://0.0.0.0:8080/v1"')(
          'verdict',
          () => awaitOver(Readiness.Wait.forLog('Ready for traffic: https://0.0.0.0:8080/v1')),
        ),
        Then('the check reports the service is ready')(({ verdict }) => {
          expect(reportedReady(verdict)).toBe(true)
        }),
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
        When('readiness is checked for pattern "service fully operational"')(
          'verdict',
          () => awaitOver(Readiness.Wait.forLog('service fully operational')),
        ),
        Then('the check gives up reporting timed out')(({ verdict }) => {
          expect(reportedReady(verdict)).toBe(false)
        }),
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
        When('readiness is checked for log line matching "listening"')(
          'outcome',
          () => awaitOver(Readiness.Wait.forLog('listening')).pipe(Effect.flip),
        ),
        Then('the check fails with the underlying stream read failure')(({ outcome }) => {
          expect(reportedLogFailure(outcome)).toBe(true)
        }),
      ),
    )
  })
