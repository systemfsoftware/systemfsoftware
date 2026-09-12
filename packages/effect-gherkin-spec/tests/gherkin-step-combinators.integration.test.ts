/**
 * Gherkin step combinators — Given / When / Then / And / But pipeline.
 *
 * Drives the `scenario` use case on `makeFeature` to prove that the do-notation
 * steps compose the way the BDD spec describes: Given/When bind into the scope,
 * Then/And/But tap the scope without binding, all failures surface as
 * `StepError`, and the pipeline can be pre-seeded via `Gherkin.startWith`.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { And, But, Gherkin, Given, StepError, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import { TestDomainError } from './__fixtures__/TestDomainError.schema.js'

const Feature = makeFeature({ it, layer })

Feature('Gherkin step combinators').body(({ scenario }) => {
  scenario(
    'A succeeding Given step adds its binding to the scope',
    Gherkin.Do.pipe(
      Given('initial state')('x', () => Effect.succeed(42)),
      Then('x equals 42')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 42 }))
      }),
    ),
  )

  scenario(
    'Multiple succeeding Given steps accumulate their bindings',
    Gherkin.Do.pipe(
      Given('first')('a', () => Effect.succeed('hello')),
      Given('second')('b', () => Effect.succeed(99)),
      Then('has both bindings')((s) => {
        expect(s).toEqual(expect.objectContaining({ a: 'hello', b: 99 }))
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
    'A Given step can read bindings from earlier steps',
    Gherkin.Do.pipe(
      Given('base')('base', () => Effect.succeed(10)),
      Given('derived')('derived', (s) => Effect.succeed(s.base * 2)),
      Then('base and derived correct')((s) => {
        expect(s).toEqual(expect.objectContaining({ base: 10, derived: 20 }))
      }),
    ),
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
          expect(err).toBeInstanceOf(StepError)
          if (err instanceof StepError) {
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
          expect(err).toBeInstanceOf(StepError)
          if (err instanceof StepError) {
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
          expect(err).toBeInstanceOf(StepError)
          if (err instanceof StepError) {
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
          expect(err).toBeInstanceOf(StepError)
          if (err instanceof StepError) {
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
          expect(err).toBeInstanceOf(StepError)
          if (err instanceof StepError) {
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
})
