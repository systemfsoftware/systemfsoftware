import {
  Gherkin,
  Given,
  it,
  makeFeature,
  StepError,
  Then,
  type VitestTaskContext,
  VitestTaskRef,
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, Ref, Result } from 'effect'
import { TestClock } from 'effect/testing'

const Feature = makeFeature({ it })

const stepErrorFacts = (result: Result.Result<object, StepError>) =>
  Result.match(result, {
    onFailure: (error) => ({ _tag: error._tag, keyword: error.keyword, text: error.text, cause: error.cause }),
    onSuccess: () => null,
  })

Feature('Gherkin pipeline execution semantics')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A multi-step pipeline accumulates bindings into scope',
      Gherkin.Do.pipe(
        Given('an initial baseline value')('base', () => Effect.succeed(10)),
        When('a multiplier is applied to the baseline')('derived', (s) => Effect.succeed(s.base * 2)),
        Then('the accumulated scope holds both the baseline and its product')((s, expect) =>
          expect({ base: s.base, derived: s.derived }).toEqual({ base: 10, derived: 20 })
        ),
      ),
    )

    scenario(
      'Tap steps inspect scope without adding or mutating bindings',
      Gherkin.Do.pipe(
        Given('an authenticated session token')('token', () => Effect.succeed('tok_test_123')),
        Then('the taps leave the token and the scope untouched')((s, expect) =>
          expect({ token: s.token, keys: Object.keys(s) }).toEqual({ token: 'tok_test_123', keys: ['token'] })
        ),
      ),
    )

    scenario(
      'A failing Given step short-circuits the pipeline and fails with StepError',
      Effect.gen(function*() {
        const whenExecuted = yield* Ref.make(false)

        return yield* Gherkin.Do.pipe(
          When('a pipeline whose first step fails is run')('outcome', () =>
            Effect.gen(function*() {
              const pipeline = Gherkin.Do.pipe(
                Given('a failing step that encounters an unexpected defect')(
                  'fault',
                  () => Effect.fail('unauthorized_access'),
                ),
                When('a downstream action is invoked')('unreachable', () =>
                  Ref.set(whenExecuted, true).pipe(Effect.as(99))),
              )
              const result = yield* Effect.result(pipeline)
              const executed = yield* Ref.get(whenExecuted)
              return { result, executed }
            })),
          Then('the pipeline fails with a Given StepError and the downstream step never ran')((s, expect) =>
            expect({ failure: stepErrorFacts(s.outcome.result), executed: s.outcome.executed }).toEqual({
              failure: {
                _tag: 'StepError',
                keyword: 'given',
                text: 'a failing step that encounters an unexpected defect',
                cause: 'unauthorized_access',
              },
              executed: false,
            })
          ),
        )
      }),
    )

    scenario(
      'When poll retries deterministically under virtual TestClock without wall-clock waits',
      Effect.gen(function*() {
        const attemptsRef = yield* Ref.make(0)

        const pipeline = Gherkin.Do.pipe(
          Given('a service deployment')('ready', () => Effect.succeed(true)),
          When.poll('the service converges to healthy', {
            interval: '10 millis',
            timeout: '500 millis',
          })(() =>
            Ref.updateAndGet(attemptsRef, (n) => n + 1).pipe(
              Effect.flatMap((n) => {
                if (n < 3) {
                  return Effect.fail('not yet healthy')
                }
                return Effect.void
              }),
            )
          ),
        )

        const fiber = yield* Effect.forkChild(pipeline)
        yield* TestClock.adjust('10 millis')
        yield* TestClock.adjust('10 millis')
        yield* TestClock.adjust('10 millis')
        yield* Fiber.join(fiber)

        return yield* Gherkin.Do.pipe(
          Given('the poll has converged')('attempts', () => Ref.get(attemptsRef)),
          Then('the service was polled three times before it reported healthy')((s, expect) =>
            expect(s.attempts).toBe(3)
          ),
        )
      }),
    )

    scenario(
      'VitestTaskRef records step-lifecycle notice and error annotations with typed context',
      Effect.gen(function*() {
        const recordedAnnotations: Array<{ message: string; type: string | undefined }> = []
        const fakeCtx: VitestTaskContext = {
          annotate: (message: string, type?: string) => {
            recordedAnnotations.push({ message, type })
          },
        }

        yield* Gherkin.Do.pipe(
          Given('a validated credential record')('credId', () => Effect.succeed('cred_42')),
          Then('the credential is valid')((s, expect) => expect(s.credId).toBe('cred_42')),
          Effect.provideService(VitestTaskRef, fakeCtx),
        )

        return yield* Gherkin.Do.pipe(
          Given('the annotations the run recorded')('annotations', () => Effect.succeed(recordedAnnotations)),
          Then('each step annotated its lifecycle notice with its keyword and no wall-clock timing')((s, expect) =>
            expect({
              count: s.annotations.length,
              kinds: s.annotations.map((annotation) => annotation.type),
              messages: s.annotations.map((annotation) => annotation.message.replace(/\(\d+ms\)/, '(ms)')),
            }).toEqual({
              count: 2,
              kinds: ['notice', 'notice'],
              messages: [
                '[GIVEN] a validated credential record - passed (ms)',
                '[THEN] the credential is valid - passed (ms)',
              ],
            })
          ),
        )
      }),
    )
  })
