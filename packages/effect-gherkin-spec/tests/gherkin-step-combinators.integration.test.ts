/**
 * Gherkin step combinators — Given / When / Then / And / But pipeline.
 *
 * Drives the `scenario` use case on `makeFeature` to prove that the do-notation
 * steps compose the way the BDD spec describes: Given/When bind into the scope,
 * Then/And/But tap the scope without binding, all failures surface as
 * `StepError`, and the pipeline can be pre-seeded via `Gherkin.startWith`.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import {
  And,
  But,
  checkSoftFailures,
  Gherkin,
  Given,
  StepError,
  Then,
  type VitestTaskContext,
  VitestTaskRef,
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { Chunk, Effect, Fiber, Result } from 'effect'
import { Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { TestDomainError } from './__fixtures__/TestDomainError.schema.js'

const Feature = makeFeature({ it, layer })

Feature('Gherkin step combinators').body(({ scenario }) => {
  scenario(
    'A step assertion verifies Effect values using value equality',
    Gherkin.Do.pipe(
      Given('a list of numbers in a Chunk')('items', () => Effect.succeed(Chunk.make(1, 2, 3))),
      Then('the items match an identical Chunk by value equality')((s) => {
        expect(s.items).toEqual(Chunk.make(1, 2, 3))
      }),
    ),
  )

  scenario(
    'A failing Given step surfaces as a step failure',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('boom')('x', () => Effect.fail('kaboom')),
        Effect.result,
      )
      expect(result).toEqual(Result.fail(expect.any(StepError)))
    }),
  )

  scenario(
    'A succeeding When step adds its binding to the scope',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      When('action')('y', (s) => Effect.succeed(s.x + 10)),
      Then('both present')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 1, y: 11 }))
      }),
    ),
  )

  scenario(
    'A failing When step surfaces as a step failure',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        When('explode')('y', () => Effect.fail('boom')),
        Effect.result,
      )
      expect(result).toEqual(Result.fail(expect.any(StepError)))
    }),
  )

  scenario(
    'A succeeding Then step leaves the scope intact',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(42)),
      Then('check value')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 42 }))
      }),
      Then('no extra keys')((s) => {
        expect(Object.keys(s)).toEqual(['x'])
      }),
    ),
  )

  scenario(
    'A Then step does not add bindings to the scope',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed('a')),
      Then('ignored return')(() => {
        void Effect.succeed('should not leak')
      }),
      Then('scope unchanged')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 'a' }))
        expect(Object.keys(s)).toEqual(['x'])
      }),
    ),
  )

  scenario(
    'A succeeding And step leaves the scope intact',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      And('additional check')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 1 }))
      }),
    ),
  )

  scenario(
    'A succeeding But step leaves the scope intact',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      But('negative check')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 1 }))
      }),
    ),
  )

  scenario(
    'A domain error from a step is surfaced as a step failure',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('failing step')('x', () => Effect.fail(new TestDomainError({ message: 'domain oops' }))),
        Effect.result,
      )
      expect(result).toEqual(Result.fail(expect.any(StepError)))
    }),
  )

  scenario(
    'A failing Then assertion surfaces as a StepError',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('assertion')((s) => {
          expect(s.x).toBe(999)
        }),
        Effect.result,
      )
      Result.match(result, {
        onFailure: (err) => {
          expect(err).toBeInstanceOf(StepError)
        },
        onSuccess: () => {
          throw new Error('Expected failure')
        },
      })
    }),
  )

  scenario(
    'A failing Then step surfaces as a StepError',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('fail')(() => {
          throw new Error('then-err')
        }),
        Effect.result,
      )
      expect(result).toEqual(Result.fail(expect.any(StepError)))
    }),
  )

  scenario(
    'A constructed step error carries its keyword and text',
    Effect.sync(() => {
      const err = StepError.make({ keyword: 'when', text: 'action', cause: null })
      expect(err).toEqual(expect.objectContaining({ keyword: 'when', text: 'action', cause: null }))
    }),
  )

  scenario(
    'A step error preserves its original cause',
    Effect.sync(() => {
      const original = new Error('deep failure')
      const err = StepError.make({ keyword: 'given', text: 'step', cause: original })
      expect(err).toEqual(expect.objectContaining({ cause: original }))
    }),
  )

  scenario(
    'A failed Given step carries the Given keyword in its error',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('failing given')('x', () => Effect.fail('err')),
        Effect.result,
      )
      Result.match(result, {
        onFailure: (err) => {
          expect(Schema.is(StepError)(err)).toBe(true)
          if (Schema.is(StepError)(err)) {
            expect(err.keyword).toBe('given')
          }
        },
        onSuccess: () => expect.unreachable('Expected Failure with StepError'),
      })
    }),
  )

  scenario(
    'A failed When step carries the When keyword in its error',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        When('failing when')('y', () => Effect.fail('err')),
        Effect.result,
      )
      Result.match(result, {
        onFailure: (err) => {
          expect(Schema.is(StepError)(err)).toBe(true)
          if (Schema.is(StepError)(err)) {
            expect(err.keyword).toBe('when')
          }
        },
        onSuccess: () => expect.unreachable('Expected Failure with StepError'),
      })
    }),
  )

  scenario(
    'A failed Then step carries the Then keyword in its error',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        Then('throwing then')(() => {
          throw new Error('then-err')
        }),
        Effect.result,
      )
      Result.match(result, {
        onFailure: (err) => {
          expect(Schema.is(StepError)(err)).toBe(true)
          if (Schema.is(StepError)(err)) {
            expect(err.keyword).toBe('then')
          }
        },
        onSuccess: () => expect.unreachable('Expected Failure with StepError'),
      })
    }),
  )

  scenario(
    'A failed And step carries the And keyword in its error',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        And('throwing and')(() => {
          throw new Error('and-err')
        }),
        Effect.result,
      )
      Result.match(result, {
        onFailure: (err) => {
          expect(Schema.is(StepError)(err)).toBe(true)
          if (Schema.is(StepError)(err)) {
            expect(err.keyword).toBe('and')
          }
        },
        onSuccess: () => expect.unreachable('Expected Failure with StepError'),
      })
    }),
  )

  scenario(
    'A failed But step carries the But keyword in its error',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        But('throwing but')(() => {
          throw new Error('but-err')
        }),
        Effect.result,
      )
      Result.match(result, {
        onFailure: (err) => {
          expect(Schema.is(StepError)(err)).toBe(true)
          if (Schema.is(StepError)(err)) {
            expect(err.keyword).toBe('but')
          }
        },
        onSuccess: () => expect.unreachable('Expected Failure with StepError'),
      })
    }),
  )

  scenario(
    'A full pipeline accumulates bindings across Given, When, Then and And',
    Gherkin.Do.pipe(
      Given('user exists')('user', () => Effect.succeed({ id: 1 })),
      When('request sent')('response', (s) => Effect.succeed({ status: 200, userId: s.user.id })),
      Then('status ok')((s) => {
        expect(s.response).toEqual(expect.objectContaining({ status: 200 }))
      }),
      And('user id matches')((s) => {
        expect(s.response.userId).toBe(s.user.id)
      }),
    ),
  )

  scenario(
    'Chained When steps each read bindings from prior steps',
    Gherkin.Do.pipe(
      Given('base')('a', () => Effect.succeed(1)),
      When('double')('b', (s) => Effect.succeed(s.a * 2)),
      When('add ten')('c', (s) => Effect.succeed(s.b + 10)),
      Then('all values correct')((s) => {
        expect(s).toEqual(expect.objectContaining({ a: 1, b: 2, c: 12 }))
      }),
    ),
  )

  scenario(
    'A pre-seeded scope is available to subsequent steps',
    Gherkin.startWith({ userId: 42 }).pipe(
      When('fetch user')('profile', (s) => Effect.succeed({ name: 'Alice', id: s.userId })),
      Then('has both')((s) => {
        expect(s).toEqual(expect.objectContaining({ userId: 42 }))
        expect(s.profile).toEqual(expect.objectContaining({ name: 'Alice' }))
      }),
    ),
  )

  scenario(
    'Pre-seeded bindings remain visible inside the scenario',
    Gherkin.startWith({ x: 'typed', y: 123 }).pipe(
      Then('values match')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 'typed', y: 123 }))
      }),
    ),
  )

  scenario(
    'A Then step returning an Effect leaves the scope intact',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      Then('check via Effect')((s) =>
        Effect.sync(() => {
          expect(s.x).toBe(1)
        })
      ),
      Then('scope unchanged')((s) => {
        expect(Object.keys(s)).toEqual(['x'])
      }),
    ),
  )

  scenario(
    'An And step returning an Effect leaves the scope intact',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(42)),
      Then('first check')((s) => {
        expect(s.x).toBe(42)
      }),
      And('second check via Effect')((s) =>
        Effect.sync(() => {
          expect(s.x).toBe(42)
        })
      ),
    ),
  )

  scenario(
    'A failing Effect-returning Then step surfaces as a step failure',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('Effect that fails')(() => Effect.fail(new TestDomainError({ message: 'effect-fail' }))),
        Effect.result,
      )
      expect(result).toEqual(Result.fail(expect.any(StepError)))
    }),
  )

  scenario(
    'An assertion failure inside an Effect-returning Then step propagates as an assertion error',
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('Effect assertion')((s) =>
          Effect.sync(() => {
            expect(s.x).toBe(999)
          })
        ),
        Effect.result,
      )
      expect(result).toEqual(Result.fail(expect.any(Error)))
    }),
  )

  scenario(
    'A Then step returning void explicitly still succeeds',
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(5)),
      Then('explicit void')(() => {
        void 0
      }),
      Then('still works')((s) => {
        expect(s.x).toBe(5)
      }),
    ),
  )

  scenario(
    'An empty pipeline exposes an empty scope',
    Gherkin.Do.pipe(
      Then('empty')((s) => {
        expect(Object.keys(s)).toEqual([])
      }),
    ),
  )

  scenario(
    'A step with empty text still binds its value',
    Gherkin.Do.pipe(
      Given('')('x', () => Effect.succeed('empty-text')),
      Then('binding present')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 'empty-text' }))
      }),
    ),
  )

  scenario(
    'Reusing a binding name overrides the prior value',
    Gherkin.Do.pipe(
      Given('first')('x', () => Effect.succeed(1)),
      Given('second')('x', (s) => Effect.succeed(s.x + 1)),
      Then('x is 2')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 2 }))
      }),
    ),
  )

  scenario(
    'A pipeline with passing soft assertions succeeds without error',
    Gherkin.Do.pipe(
      Given('initial state')('x', () => Effect.succeed(42)),
      Then.soft('soft check matches')((s) => {
        expect(s.x).toBe(42)
      }),
      And.soft('additional soft check matches')((s) => {
        expect(s.x).toBeGreaterThan(40)
      }),
      But.soft('negative soft check matches')((s) => {
        expect(s.x).not.toBe(0)
      }),
    ),
  )

  scenario(
    'Multiple failing soft assertions run completely and aggregate all errors',
    Effect.gen(function*() {
      const pipeline = Gherkin.Do.pipe(
        Given('initial state')('x', () => Effect.succeed(1)),
        Then.soft('first soft check')((s) => {
          expect(s.x).toBe(100)
        }),
        Then.soft('second soft check')((s) => {
          expect(s.x).toBe(200)
        }),
      )
      const result = yield* checkSoftFailures(pipeline.pipe(Effect.asVoid)).pipe(Effect.result)
      Result.match(result, {
        onFailure: (err) => {
          expect(err).toBeInstanceOf(StepError)
          expect(String(err.cause)).toContain('first soft check')
          expect(String(err.cause)).toContain('second soft check')
        },
        onSuccess: () => {
          throw new Error('Expected soft assertions to fail')
        },
      })
    }),
  )

  scenario(
    'A pipeline with one failing and one passing soft assertion reports only the failure',
    Effect.gen(function*() {
      const pipeline = Gherkin.Do.pipe(
        Given('initial state')('x', () => Effect.succeed(1)),
        Then.soft('failing soft check')((s) => {
          expect(s.x).toBe(999)
        }),
        Then.soft('passing soft check')((s) => {
          expect(s.x).toBe(1)
        }),
      )
      const result = yield* checkSoftFailures(pipeline.pipe(Effect.asVoid)).pipe(Effect.result)
      Result.match(result, {
        onFailure: (err) => {
          expect(err).toBeInstanceOf(StepError)
          expect(String(err.cause)).toContain('failing soft check')
          expect(String(err.cause)).not.toContain('passing soft check')
        },
        onSuccess: () => {
          throw new Error('Expected soft assertions to fail')
        },
      })
    }),
  )

  scenario(
    'A synchronous expect throw inside Then.soft does not abort subsequent steps',
    Effect.gen(function*() {
      let secondStepRan = false
      const pipeline = Gherkin.Do.pipe(
        Given('initial state')('x', () => Effect.succeed(1)),
        Then.soft('throwing soft check')(() => {
          throw new Error('sync-throw-in-soft')
        }),
        Then.soft('subsequent soft check')(() => {
          secondStepRan = true
          throw new Error('subsequent-soft-throw')
        }),
      )
      const result = yield* checkSoftFailures(pipeline.pipe(Effect.asVoid)).pipe(Effect.result)
      expect(secondStepRan).toBe(true)
      Result.match(result, {
        onFailure: (err) => {
          expect(String(err.cause)).toContain('sync-throw-in-soft')
          expect(String(err.cause)).toContain('subsequent-soft-throw')
        },
        onSuccess: () => {
          throw new Error('Expected soft assertions to fail')
        },
      })
    }),
  )

  scenario(
    'An asynchronous condition that takes several attempts eventually passes',
    Effect.gen(function*() {
      let attempts = 0
      const pipeline = Gherkin.Do.pipe(
        Given('initial counter state')('ready', () => Effect.succeed(true)),
        Then.poll('condition eventually becomes true', {
          interval: '10 millis',
          timeout: '500 millis',
        })(() => {
          attempts++
          if (attempts < 3) {
            throw new Error('not yet satisfied')
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
    'A condition that never becomes true fails with a step error upon timeout',
    Effect.gen(function*() {
      const pipeline = Gherkin.Do.pipe(
        Given('initial state')('ready', () => Effect.succeed(true)),
        Then.poll('condition never becomes true', {
          interval: '10 millis',
          timeout: '50 millis',
        })(() => {
          throw new Error('unreachable condition')
        }),
      )
      const fiber = yield* Effect.forkChild(pipeline)
      yield* Effect.yieldNow
      yield* TestClock.adjust('100 millis')
      const result = yield* Fiber.join(fiber).pipe(Effect.result)
      Result.match(result, {
        onFailure: (err) => {
          expect(err).toBeInstanceOf(StepError)
          expect(String(err.cause)).toContain('unreachable condition')
        },
        onSuccess: () => {
          throw new Error('Expected poll to timeout and fail')
        },
      })
    }),
  )

  scenario(
    'A polling When step retries until action succeeds and binds result',
    Effect.gen(function*() {
      let calls = 0
      const pipeline = Gherkin.Do.pipe(
        Given('initial state')('x', () => Effect.succeed(10)),
        When.poll('deferred service responds', {
          interval: '10 millis',
          timeout: '500 millis',
        })('response', () => {
          calls++
          if (calls < 3) {
            return Effect.fail('service unavailable')
          }
          return Effect.succeed('service ready')
        }),
        Then('the response is recorded')((s) => {
          expect(s.response).toBe('service ready')
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
      expect(calls).toBe(3)
    }),
  )

  scenario(
    'Step execution writes progress and timing annotations to the reporting context',
    Effect.gen(function*() {
      const annotations: Array<{ message: string; type?: string | undefined }> = []
      const reporterCtx: VitestTaskContext = {
        annotate: (message: string, type?: string) => {
          annotations.push({ message, type })
        },
      }

      yield* Gherkin.Do.pipe(
        Given('an active user account')('userId', () => Effect.succeed('usr_123')),
        When('the user updates their notification preferences')((s) => Effect.succeed(s.userId)),
        Then('the preferences are stored successfully')((s) => {
          expect(s.userId).toBe('usr_123')
        }),
        Effect.provideService(VitestTaskRef, reporterCtx),
      )

      expect(annotations).toHaveLength(3)
      expect(annotations[0]?.message).toMatch(/^\[GIVEN\] an active user account - passed \(\d+ms\)$/)
      expect(annotations[0]?.type).toBe('notice')
      expect(annotations[1]?.message).toMatch(
        /^\[WHEN\] the user updates their notification preferences - passed \(\d+ms\)$/,
      )
      expect(annotations[1]?.type).toBe('notice')
      expect(annotations[2]?.message).toMatch(/^\[THEN\] the preferences are stored successfully - passed \(\d+ms\)$/)
      expect(annotations[2]?.type).toBe('notice')
    }),
  )

  scenario(
    'A failed step emits a failure diagnostic to the reporting context',
    Effect.gen(function*() {
      const annotations: Array<{ message: string; type?: string | undefined }> = []
      const reporterCtx: VitestTaskContext = {
        annotate: (message: string, type?: string) => {
          annotations.push({ message, type })
        },
      }

      const result = yield* Gherkin.Do.pipe(
        Given('an initial order submission')('orderId', () => Effect.succeed('ord_999')),
        Then('the inventory reservation confirms')((s) => {
          expect(s.orderId).toBe('ord_000')
        }),
        Effect.provideService(VitestTaskRef, reporterCtx),
        Effect.result,
      )

      expect(Result.isFailure(result)).toBe(true)
      expect(annotations).toHaveLength(2)
      expect(annotations[0]?.message).toMatch(/^\[GIVEN\] an initial order submission - passed \(\d+ms\)$/)
      expect(annotations[1]?.message).toMatch(/^\[THEN\] the inventory reservation confirms - failed \(\d+ms\)$/)
      expect(annotations[1]?.type).toBe('error')
    }),
  )

  scenario(
    'A soft assertion failure emits an error diagnostic without interrupting subsequent steps',
    Effect.gen(function*() {
      const annotations: Array<{ message: string; type?: string | undefined }> = []
      const reporterCtx: VitestTaskContext = {
        annotate: (message: string, type?: string) => {
          annotations.push({ message, type })
        },
      }

      const pipeline = Gherkin.Do.pipe(
        Given('a provisioned server instance')('serverId', () => Effect.succeed('srv_alpha')),
        Then.soft('the health check responds with healthy')((s) => {
          expect(s.serverId).toBe('srv_beta')
        }),
        And('the audit log records the check')((s) => {
          expect(s.serverId).toBe('srv_alpha')
        }),
        Effect.provideService(VitestTaskRef, reporterCtx),
      )

      const result = yield* checkSoftFailures(pipeline.pipe(Effect.asVoid)).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
      expect(annotations[0]?.message).toMatch(/^\[GIVEN\] a provisioned server instance - passed \(\d+ms\)$/)
      expect(annotations[1]?.message).toBe('[THEN] the health check responds with healthy - soft-failed')
      expect(annotations[1]?.type).toBe('error')
      expect(annotations[2]?.message).toMatch(/^\[AND\] the audit log records the check - passed \(\d+ms\)$/)
      expect(annotations[2]?.type).toBe('notice')
    }),
  )
})
