import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import { And, But, Gherkin, Given, Then, When } from '../do-notation.js'
import { StepError } from '../step-error.js'

class TestDomainError extends Schema.TaggedError<TestDomainError>()('TestDomainError', {
  message: Schema.String,
}) {}

describe('Given step binding', () => {
  it.effect('Should_AddBinding_When_GivenStepSucceeds', () =>
    Gherkin.Do.pipe(
      Given('initial state')('x', () => Effect.succeed(42)),
      Then('x equals 42')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 42 }))
      }),
    ))

  it.effect('Should_AccumulateBindings_When_MultipleGivenSteps', () =>
    Gherkin.Do.pipe(
      Given('first')('a', () => Effect.succeed('hello')),
      Given('second')('b', () => Effect.succeed(99)),
      Then('has both bindings')((s) => {
        expect(s).toEqual(expect.objectContaining({ a: 'hello', b: 99 }))
      }),
    ))

  it.effect('Should_Fail_When_GivenStepBodyDies', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('boom')('x', () => Effect.fail('kaboom')),
        Effect.either,
      )
      expect(result).toEqual(Either.left(expect.any(StepError)))
    }))

  it.effect('Should_ReadPriorBindings_When_GivenStepUsesScope', () =>
    Gherkin.Do.pipe(
      Given('base')('base', () => Effect.succeed(10)),
      Given('derived')('derived', (s) => Effect.succeed(s.base * 2)),
      Then('base and derived correct')((s) => {
        expect(s).toEqual(expect.objectContaining({ base: 10, derived: 20 }))
      }),
    ))
})

describe('When step binding', () => {
  it.effect('Should_AddBinding_When_WhenStepSucceeds', () =>
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      When('action')('y', (s) => Effect.succeed(s.x + 10)),
      Then('both present')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 1, y: 11 }))
      }),
    ))

  it.effect('Should_Fail_When_WhenStepBodyDies', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        When('explode')('y', () => Effect.fail('boom')),
        Effect.either,
      )
      expect(result).toEqual(Either.left(expect.any(StepError)))
    }))
})

describe('Then step tap', () => {
  it.effect('Should_PreserveScope_When_ThenStepSucceeds', () =>
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(42)),
      Then('check value')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 42 }))
      }),
      Then('no extra keys')((s) => {
        expect(Object.keys(s)).toEqual(['x'])
      }),
    ))

  it.effect('Should_NotAddBinding_When_ThenStepReturnsValue', () =>
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed('a')),
      Then('ignored return')(() => {
        void Effect.succeed('should not leak')
      }),
      Then('scope unchanged')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 'a' }))
        expect(Object.keys(s)).toEqual(['x'])
      }),
    ))
})

describe('And step tap', () => {
  it.effect('Should_PreserveScope_When_AndStepSucceeds', () =>
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      And('additional check')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 1 }))
      }),
    ))
})

describe('But step tap', () => {
  it.effect('Should_PreserveScope_When_ButStepSucceeds', () =>
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(1)),
      But('negative check')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 1 }))
      }),
    ))
})

describe('error wrapping', () => {
  it.effect('Should_WrapDomainError_When_NonAssertionErrorThrown', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('failing step')('x', () => Effect.fail(new TestDomainError({ message: 'domain oops' }))),
        Effect.either,
      )
      expect(result).toEqual(Either.left(expect.any(StepError)))
    }))

  it.effect('Should_PassThroughAssertionError_When_AssertionFails', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('assertion')((s) => {
          expect(s.x).toBe(999)
        }),
        Effect.either,
      )
      expect(Either.getLeft(result)).not.toBeInstanceOf(StepError)
    }))

  it.effect('Should_WrapInStepError_When_ThenStepFailsWithNonAssertion', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('fail')(() => {
          throw new Error('then-err')
        }),
        Effect.either,
      )
      expect(result).toEqual(Either.left(expect.any(StepError)))
    }))
})

describe('StepError properties', () => {
  it('Should_HaveKeywordAndText_When_Constructed', () => {
    const err = new StepError({ keyword: 'when', text: 'action', cause: null })
    expect(err).toEqual(expect.objectContaining({ keyword: 'when', text: 'action', cause: null }))
  })

  it('Should_PreserveOriginalCause_When_Wrapping', () => {
    const original = new Error('deep failure')
    const err = new StepError({ keyword: 'given', text: 'step', cause: original })
    expect(err).toEqual(expect.objectContaining({ cause: original }))
  })
})

describe('StepError keyword in pipeline', () => {
  const checkKeyword = (keyword: string, result: Either.Either<unknown, unknown>) => {
    Either.match(result, {
      onLeft: (err) => {
        expect(err).toBeInstanceOf(StepError)
        if (err instanceof StepError) {
          expect(err.keyword).toBe(keyword)
        }
      },
      onRight: () => expect.unreachable('Expected Left with StepError'),
    })
  }

  it.effect('Should_ContainGivenKeyword_When_GivenStepFails', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('failing given')('x', () => Effect.fail('err')),
        Effect.either,
      )
      checkKeyword('given', result)
    }))

  it.effect('Should_ContainWhenKeyword_When_WhenStepFails', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        When('failing when')('y', () => Effect.fail('err')),
        Effect.either,
      )
      checkKeyword('when', result)
    }))

  it.effect('Should_ContainThenKeyword_When_ThenStepThrows', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        Then('throwing then')(() => {
          throw new Error('then-err')
        }),
        Effect.either,
      )
      checkKeyword('then', result)
    }))

  it.effect('Should_ContainAndKeyword_When_AndStepThrows', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        And('throwing and')(() => {
          throw new Error('and-err')
        }),
        Effect.either,
      )
      checkKeyword('and', result)
    }))

  it.effect('Should_ContainButKeyword_When_ButStepThrows', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('ok')('x', () => Effect.succeed(1)),
        But('throwing but')(() => {
          throw new Error('but-err')
        }),
        Effect.either,
      )
      checkKeyword('but', result)
    }))
})

describe('multi-step scope accumulation', () => {
  it.effect('Should_AccumulateAllBindings_When_FullGherkinPipeline', () =>
    Gherkin.Do.pipe(
      Given('user exists')('user', () => Effect.succeed({ id: 1 })),
      When('request sent')('response', (s) => Effect.succeed({ status: 200, userId: s.user.id })),
      Then('status ok')((s) => {
        expect(s.response).toEqual(expect.objectContaining({ status: 200 }))
      }),
      And('user id matches')((s) => {
        expect(s.response.userId).toBe(s.user.id)
      }),
    ))

  it.effect('Should_ChainMultipleWhens_When_EachReadsPriorScope', () =>
    Gherkin.Do.pipe(
      Given('base')('a', () => Effect.succeed(1)),
      When('double')('b', (s) => Effect.succeed(s.a * 2)),
      When('add ten')('c', (s) => Effect.succeed(s.b + 10)),
      Then('all values correct')((s) => {
        expect(s).toEqual(expect.objectContaining({ a: 1, b: 2, c: 12 }))
      }),
    ))
})

describe('startWith', () => {
  it.effect('Should_PreSeedScope_When_UsingStartWith', () =>
    Gherkin.startWith({ userId: 42 }).pipe(
      When('fetch user')('profile', (s) => Effect.succeed({ name: 'Alice', id: s.userId })),
      Then('has both')((s) => {
        expect(s).toEqual(expect.objectContaining({ userId: 42 }))
        expect(s.profile).toEqual(expect.objectContaining({ name: 'Alice' }))
      }),
    ))

  it.effect('Should_PreserveExactType_When_StartWithProvidesBindings', () =>
    Gherkin.startWith({ x: 'typed', y: 123 }).pipe(
      Then('values match')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 'typed', y: 123 }))
      }),
    ))
})

describe('Effect-returning tap steps', () => {
  it.effect('Should_PreserveScope_When_ThenStepReturnsEffect', () =>
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
    ))

  it.effect('Should_PreserveScope_When_AndStepReturnsEffect', () =>
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
    ))

  it.effect('Should_WrapError_When_EffectReturningThenFails', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('Effect that fails')(() => Effect.fail(new TestDomainError({ message: 'effect-fail' }))),
        Effect.either,
      )
      expect(result).toEqual(Either.left(expect.any(StepError)))
    }))

  it.effect('Should_PassthroughAssertion_When_EffectReturningThenHasAssertionError', () =>
    Effect.gen(function*() {
      const result = yield* Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('Effect assertion')((s) =>
          Effect.sync(() => {
            expect(s.x).toBe(999)
          })
        ),
        Effect.either,
      )
      expect(result).toEqual(Either.left(expect.any(Error)))
    }))

  it.effect('Should_Succeed_When_ThenStepReturnsVoidExplicitly', () =>
    Gherkin.Do.pipe(
      Given('setup')('x', () => Effect.succeed(5)),
      Then('explicit void')(() => {
        void 0
      }),
      Then('still works')((s) => {
        expect(s.x).toBe(5)
      }),
    ))
})

describe('edge cases', () => {
  it.effect('Should_SucceedWithEmptyScope_When_NoSteps', () =>
    Gherkin.Do.pipe(
      Then('empty')((s) => {
        expect(Object.keys(s)).toEqual([])
      }),
    ))

  it.effect('Should_WorkWithEmptyText_When_TextNotProvided', () =>
    Gherkin.Do.pipe(
      Given('')('x', () => Effect.succeed('empty-text')),
      Then('binding present')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 'empty-text' }))
      }),
    ))

  it.effect('Should_OverridePriorBinding_When_SameNameReused', () =>
    Gherkin.Do.pipe(
      Given('first')('x', () => Effect.succeed(1)),
      Given('second')('x', (s) => Effect.succeed(s.x + 1)),
      Then('x is 2')((s) => {
        expect(s).toEqual(expect.objectContaining({ x: 2 }))
      }),
    ))
})
