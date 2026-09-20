/**
 * Pipeline Semantics Integration Tests
 *
 * Proves that Gherkin pipelines execute directly as pure Effect values:
 * - scope accumulation through step bindings
 * - non-binding tap steps leave scope intact
 * - failing steps short-circuit with typed StepError
 * - checkSoftFailures aggregates soft assertions
 * - virtual-time polling with TestClock
 * - VitestTaskRef receives step-lifecycle notice and error annotations
 */
import {
  And,
  checkSoftFailures,
  Gherkin,
  Given,
  it,
  layer,
  makeFeature,
  StepError,
  Then,
  type VitestTaskContext,
  VitestTaskRef,
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Ref, Result } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Gherkin pipeline execution semantics').body(({ scenario }) => {
  scenario(
    'A multi-step pipeline accumulates bindings into scope',
    Effect.gen(function*() {
      const scope = yield* Gherkin.Do.pipe(
        Given('an initial baseline value')('base', () => Effect.succeed(10)),
        When('a multiplier is applied to the baseline')('derived', (s) => Effect.succeed(s.base * 2)),
      )

      expect(scope).toEqual(expect.objectContaining({ base: 10, derived: 20 }))
      expect(Object.keys(scope).sort()).toEqual(['base', 'derived'])
    }),
  )

  scenario(
    'Tap steps inspect scope without adding or mutating bindings',
    Effect.gen(function*() {
      let inspectedValue = 0

      const scope = yield* Gherkin.Do.pipe(
        Given('an authenticated session token')('token', () => Effect.succeed('tok_test_123')),
        Then('the token matches the expected format')((s) => {
          inspectedValue = s.token.length
          expect(s.token).toBe('tok_test_123')
        }),
        And('the token remains accessible in subsequent tap steps')((s) => {
          expect(s.token).toBe('tok_test_123')
        }),
      )

      expect(inspectedValue).toBe(12)
      expect(Object.keys(scope)).toEqual(['token'])
    }),
  )

  scenario(
    'A failing Given step short-circuits the pipeline and fails with StepError',
    Effect.gen(function*() {
      const whenExecuted = yield* Ref.make(false)

      const pipeline = Gherkin.Do.pipe(
        Given('a failing step that encounters an unexpected defect')('fault', () => Effect.fail('unauthorized_access')),
        When('a downstream action is invoked')('unreachable', () => Ref.set(whenExecuted, true).pipe(Effect.as(99))),
      )

      const result = yield* Effect.result(pipeline)

      Result.match(result, {
        onFailure: (err) => {
          expect(err).toBeInstanceOf(StepError)
          expect(err.keyword).toBe('given')
          expect(err.text).toBe('a failing step that encounters an unexpected defect')
          expect(String(err.cause)).toContain('unauthorized_access')
        },
        onSuccess: () => {
          throw new Error('Expected pipeline to fail')
        },
      })

      const executed = yield* Ref.get(whenExecuted)
      expect(executed).toBe(false)
    }),
  )

  scenario(
    'checkSoftFailures aggregates multiple soft assertion failures into a single StepError',
    Effect.gen(function*() {
      const pipeline = Gherkin.Do.pipe(
        Given('a configured test environment')('env', () => Effect.succeed('staging')),
        Then.soft('the database connection status is active')(() => {
          throw new Error('connection refused')
        }),
        Then.soft('the cache tier is warm')(() => {
          throw new Error('cache miss')
        }),
      )

      const result = yield* checkSoftFailures(pipeline.pipe(Effect.asVoid)).pipe(Effect.result)

      Result.match(result, {
        onFailure: (err) => {
          expect(err).toBeInstanceOf(StepError)
          expect(err.keyword).toBe('then')
          expect(String(err.cause)).toContain('connection refused')
          expect(String(err.cause)).toContain('cache miss')
        },
        onSuccess: () => {
          throw new Error('Expected soft assertions to fail')
        },
      })
    }),
  )

  scenario(
    'When poll retries deterministically under virtual TestClock without wall-clock waits',
    Effect.gen(function*() {
      let attempts = 0

      const pipeline = Gherkin.Do.pipe(
        Given('a service deployment')('ready', () => Effect.succeed(true)),
        When.poll('the service converges to healthy', {
          interval: '10 millis',
          timeout: '500 millis',
        })(() => {
          attempts++
          if (attempts < 3) {
            throw new Error('not yet healthy')
          }
        }),
      )

      const fiber = yield* Effect.forkChild(pipeline)
      yield* Effect.yieldNow
      yield* TestClock.adjust('10 millis')
      yield* Effect.yieldNow
      yield* TestClock.adjust('10 millis')
      yield* Effect.yieldNow
      yield* TestClock.adjust('10 millis')
      yield* Fiber.join(fiber)

      expect(attempts).toBe(3)
    }),
  )

  scenario(
    'VitestTaskRef records step-lifecycle notice and error annotations with typed context',
    Effect.gen(function*() {
      const annotations: Array<{ message: string; type: string | undefined }> = []
      const fakeCtx: VitestTaskContext = {
        annotate: (message: string, type?: string) => {
          annotations.push({ message, type })
        },
      }

      yield* Gherkin.Do.pipe(
        Given('a validated credential record')('credId', () => Effect.succeed('cred_42')),
        Then('the credential is valid')((s) => {
          expect(s.credId).toBe('cred_42')
        }),
        Effect.provideService(VitestTaskRef, fakeCtx),
      )

      expect(annotations).toHaveLength(2)
      expect(annotations[0]?.message).toMatch(/^\[GIVEN\] a validated credential record - passed \(\d+ms\)$/)
      expect(annotations[0]?.type).toBe('notice')
      expect(annotations[1]?.message).toMatch(/^\[THEN\] the credential is valid - passed \(\d+ms\)$/)
      expect(annotations[1]?.type).toBe('notice')
    }),
  )
})
