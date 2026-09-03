import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit, Fiber, Ref, Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { detachIn } from './__fixtures__/HookPublic.js'

const Feature = makeFeature({ it, layer })

const onGaveUp = (): string => 'gave-up'

interface Detached {
  readonly scope: Scope.Scope
  readonly done: Ref.Ref<boolean>
  readonly interrupted: Ref.Ref<boolean>
  readonly caller: Fiber.Fiber<string, never>
}

const detachedFor = (deadline: number, workMillis: number): Effect.Effect<Detached> =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const done = yield* Ref.make(false)
    const interrupted = yield* Ref.make(false)
    const work = Effect.sleep(workMillis).pipe(
      Effect.andThen(Ref.set(done, true)),
      Effect.as('finished'),
      Effect.onInterrupt(() => Ref.set(interrupted, true)),
    )
    const caller = yield* Effect.forkChild(
      detachIn(work, scope, { deadline, onDeadline: onGaveUp }),
    )
    return { scope, done, interrupted, caller }
  })

Feature('Detaching work past a deadline')
  .body(({ scenario }) => {
    scenario(
      'Work outrunning the deadline resolves the caller with the fallback',
      Gherkin.Do.pipe(
        Given('work that takes longer than the deadline')('detached', (_s) => detachedFor(100, 5000)),
        When('the deadline passes')('seen', (s) =>
          Effect.gen(function*() {
            yield* TestClock.adjust(100)
            return yield* Fiber.join(s.detached.caller)
          })),
        Then('the caller observes the fallback while the work is untouched')((s) =>
          Effect.gen(function*() {
            expect(s.seen).toBe('gave-up')
            expect(yield* Ref.get(s.detached.done)).toBe(false)
            expect(yield* Ref.get(s.detached.interrupted)).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Abandoned work left alone still completes',
      Gherkin.Do.pipe(
        Given('work that takes longer than the deadline')('detached', (_s) => detachedFor(100, 5000)),
        When('the deadline passes and the work runs on')('finished', (s) =>
          Effect.gen(function*() {
            yield* TestClock.adjust(100)
            yield* Fiber.join(s.detached.caller)
            yield* TestClock.adjust(5000)
            return yield* Ref.get(s.detached.done)
          })),
        Then('the work records its completion')((s) =>
          Effect.sync(() => {
            expect(s.finished).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Closing the scope interrupts abandoned work',
      Gherkin.Do.pipe(
        Given('work that takes longer than the deadline')('detached', (_s) => detachedFor(100, 5000)),
        When('the deadline passes and the scope closes')('observed', (s) =>
          Effect.gen(function*() {
            yield* TestClock.adjust(100)
            yield* Fiber.join(s.detached.caller)
            yield* Scope.close(s.detached.scope, Exit.succeed(undefined))
            yield* TestClock.adjust(5000)
            return {
              interrupted: yield* Ref.get(s.detached.interrupted),
              done: yield* Ref.get(s.detached.done),
            }
          })),
        Then('the work is interrupted and never completes')((s) =>
          Effect.sync(() => {
            expect(s.observed.interrupted).toBe(true)
            expect(s.observed.done).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Work beating the deadline resolves with the work result',
      Gherkin.Do.pipe(
        Given('work that finishes before the deadline')('detached', (_s) => detachedFor(5000, 100)),
        When('the work elapses')('seen', (s) =>
          Effect.gen(function*() {
            yield* TestClock.adjust(100)
            return yield* Fiber.join(s.detached.caller)
          })),
        Then('the caller observes the work result')((s) =>
          Effect.sync(() => {
            expect(s.seen).toBe('finished')
          })
        ),
      ),
    )
  })
