/**
 * Assertion helpers for tests running on this fork. Deep equality is Vitest's Chai `assert`, because the fork
 * also runs in a browser and no Node builtin module may back it; Effect values compare through the `Equal`
 * trait.
 */
import type * as Cause from 'effect/Cause'
import * as Equal from 'effect/Equal'
import * as Exit from 'effect/Exit'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import { assert as vassert } from 'vitest'

/**
 * Inspects the value a thunk threw. `A` defaults to `unknown` so a caller passes any inspection function.
 */
type ThrownValidator = <A = unknown>(thrown: A) => undefined

/**
 * Any class, abstract ones included: what `assertInstanceOf` accepts and what `instanceof` takes.
 */
type AnyConstructor = abstract new(...args: never[]) => object

/**
 * Whether `actual` — possibly absent — contains `expected`.
 */
const includes = (actual: string | undefined, expected: string): boolean =>
  actual !== undefined && actual.includes(expected)

/**
 * `assertEquals`'s message when the caller gave none: the two values are deep-equal, so only the `Equal` trait
 * explains the failure.
 */
const equalMismatch = (message: string | undefined): string => message ?? 'Expected values to be Equal.equals'

/**
 * `assertInstanceOf`'s message when the caller gave none: the value may be anything, so only the constructor
 * names the expectation.
 */
const instanceMismatch = (constructor: AnyConstructor, message: string | undefined): string =>
  message ?? `Expected value to be an instance of ${constructor.name}`

/**
 * Runs `thunk`, then applies `error`'s expectation to anything it threw: a validator inspects the value, an
 * `Error` must be deep-strict-equal to it, and no expectation accepts any throw.
 */
const applyThrown = (thunk: () => void, error: Error | ThrownValidator | undefined): void => {
  try {
    thunk()
  } catch (e) {
    Option.match(Option.fromNullishOr(error), {
      onNone: () => undefined,
      onSome: (expectation) => Predicate.isFunction(expectation) ? expectation(e) : deepStrictEqual(e, expectation),
    })
    return
  }
  fail('Expected to throw an error')
}

/**
 * Whether a dual assertion call is the data-first one: a piped call names the expected value alone, and a
 * pair of values is the only other shape these helpers take.
 *
 * No overload of them carries a message, because a pipeable signature has to repeat its data-first twin
 * parameter for parameter (`effecttsgo/missing-pipeable-signature`). A pair of values therefore cannot be
 * mistaken for a value and a message, in the types or here, and the message a caller might have written is
 * refused rather than dropped.
 */
const byTwoValues = (args: IArguments): boolean => args.length >= 2

// ----------------------------
// Primitives
// ----------------------------

/**
 * Fails the current test with the provided error message.
 *
 * @since 4.0.0
 */
export function fail(message: string) {
  vassert.fail(message)
}

/**
 * Asserts that `actual` is deeply strictly equal to `expected`.
 *
 * @since 4.0.0
 */
export const deepStrictEqual: {
  <A>(actual: A, expected: A, message?: undefined): void
  <A>(expected: A, message?: undefined): (actual: A) => void
} = dual(
  byTwoValues,
  <A>(actual: A, expected: A, message?: string): void => {
    vassert.deepStrictEqual(actual, expected, message)
  },
)

/**
 * Asserts that `actual` is not deeply strictly equal to `expected`.
 *
 * Chai names the negation of its deep comparison `notDeepEqual`; there, `deepStrictEqual` and `deepEqual` are
 * one function.
 *
 * @since 4.0.0
 */
export const notDeepStrictEqual: {
  <A>(actual: A, expected: A, message?: undefined): void
  <A>(expected: A, message?: undefined): (actual: A) => void
} = dual(
  byTwoValues,
  <A>(actual: A, expected: A, message?: string): void => {
    vassert.notDeepEqual(actual, expected, message)
  },
)

/**
 * Asserts that `actual` is strictly equal to `expected`.
 *
 * @since 4.0.0
 */
export const strictEqual: {
  <A>(actual: A, expected: A, message?: undefined): void
  <A>(expected: A, message?: undefined): (actual: A) => void
} = dual(
  byTwoValues,
  <A>(actual: A, expected: A, message?: string): void => {
    vassert.strictEqual(actual, expected, message)
  },
)

/**
 * Asserts that `actual` is equal to `expected` using the `Equal.equals` trait.
 *
 * @since 4.0.0
 */
export const assertEquals: {
  <A>(actual: A, expected: A, message?: undefined): void
  <A>(expected: A, message?: undefined): (actual: A) => void
} = dual(
  byTwoValues,
  <A>(actual: A, expected: A, message?: string): void => {
    if (Equal.equals(actual, expected)) return
    vassert.deepStrictEqual(actual, expected, message) // show the deep diff
    fail(equalMismatch(message))
  },
)

/**
 * Asserts that `thunk` does not throw an error.
 *
 * @since 4.0.0
 */
export const doesNotThrow: {
  (thunk: () => void, message?: string): void
  (message?: string): (thunk: () => void) => void
} = dual(
  (args) => args.length >= 2 || typeof args[0] === 'function',
  (thunk: () => void, message?: string): void => {
    vassert.doesNotThrow(thunk, undefined, undefined, message)
  },
)

// ----------------------------
// Derived
// ----------------------------

/**
 * Asserts that `value` is an instance of `constructor`.
 *
 * @since 4.0.0
 */
export const assertInstanceOf: {
  <C extends AnyConstructor>(
    value: unknown,
    ctor: C,
    message?: string,
  ): asserts value is InstanceType<C>
  <C extends AnyConstructor>(
    ctor: C,
    message?: string,
  ): (value: unknown) => asserts value is InstanceType<C>
} = dual(
  (args) => args.length >= 2 && typeof args[1] !== 'string',
  <C extends AnyConstructor>(
    value: unknown,
    ctor: C,
    message?: string,
  ): asserts value is InstanceType<C> => {
    if (value instanceof ctor) return
    fail(instanceMismatch(ctor, message))
  },
)

/**
 * Asserts that `self` is `true`.
 *
 * @since 4.0.0
 */
export const assertTrue: {
  (self: boolean, message?: string): asserts self
  (message?: string): (self: boolean) => asserts self
} = dual(
  (args) => args.length >= 2 || typeof args[0] === 'boolean',
  (self: boolean, message?: string): asserts self => {
    vassert.strictEqual(self, true, message)
  },
)

/**
 * Asserts that `self` is `false`.
 *
 * @since 4.0.0
 */
export const assertFalse: {
  (self: boolean, message?: string): void
  (message?: string): (self: boolean) => void
} = dual(
  (args) => args.length >= 2 || typeof args[0] === 'boolean',
  (self: boolean, message?: string): void => {
    vassert.strictEqual(self, false, message)
  },
)

/**
 * Asserts that `actual` includes `expected`.
 *
 * @since 4.0.0
 */
export const assertInclude: {
  (actual: string | undefined, expected: string): void
  (expected: string): (actual: string | undefined) => void
} = dual(
  (args) => args.length >= 2,
  (actual: string | undefined, expected: string): void => {
    if (!includes(actual, expected)) {
      fail(`Expected\n\n${actual}\n\nto include\n\n${expected}`)
    }
  },
)

/**
 * Asserts that `actual` matches `regExp`.
 *
 * @since 4.0.0
 */
export const assertMatch: {
  (actual: string, regExp: RegExp): void
  (regExp: RegExp): (actual: string) => void
} = dual(
  (args) => args.length >= 2,
  (actual: string, regExp: RegExp): void => {
    if (!regExp.test(actual)) {
      fail(`Expected\n\n${actual}\n\nto match\n\n${regExp}`)
    }
  },
)

/**
 * Asserts that `thunk` throws, optionally checking the thrown value against an expected `Error` or validation
 * function.
 *
 * @since 4.0.0
 */
export const throws: {
  (thunk: () => void, error?: Error | ThrownValidator): void
  (error?: Error | ThrownValidator): (thunk: () => void) => void
} = dual(
  (args) => args.length >= 2 || typeof args[0] === 'function',
  (thunk: () => void, error?: Error | ThrownValidator): void => {
    applyThrown(thunk, error)
  },
)

/**
 * Asserts that `thunk` throws or returns a rejected promise, optionally checking the failure value against an
 * expected `Error` or validation function.
 *
 * @since 4.0.0
 */
export const throwsAsync: {
  (thunk: () => Promise<void>, error?: Error | ThrownValidator): Promise<void>
  (error?: Error | ThrownValidator): (thunk: () => Promise<void>) => Promise<void>
} = dual(
  (args) => args.length >= 2 || typeof args[0] === 'function',
  (thunk: () => Promise<void>, error?: Error | ThrownValidator): Promise<void> =>
    Promise.resolve()
      .then(thunk)
      .then(
        () => fail('Expected to throw an error'),
        (thrown) =>
          applyThrown(() => {
            throw thrown
          }, error),
      ),
)

// ----------------------------
// Option
// ----------------------------

/**
 * Asserts that `option` is `None`.
 *
 * @since 4.0.0
 */
export function assertNone<A>(option: Option.Option<A>): asserts option is Option.None<never> {
  deepStrictEqual(option, Option.none())
}

/**
 * Asserts that `a` is not `undefined`.
 *
 * @since 4.0.0
 */
export function assertDefined<A>(a: A | undefined): asserts a is Exclude<A, undefined> {
  if (a === undefined) {
    fail('Expected value to be defined')
  }
}

/**
 * Asserts that `a` is `undefined`.
 *
 * @since 4.0.0
 */
export function assertUndefined<A>(a: A | undefined): asserts a is undefined {
  if (a !== undefined) {
    fail('Expected value to be undefined')
  }
}

/**
 * Asserts that `option` is `Some` and contains a value equal to `expected`.
 *
 * @since 4.0.0
 */
export const assertSome: {
  <A>(option: Option.Option<A>, expected: A): asserts option is Option.Some<A>
  <A>(expected: A): (option: Option.Option<A>) => asserts option is Option.Some<A>
} = dual(
  (args) => args.length >= 2,
  <A>(option: Option.Option<A>, expected: A): asserts option is Option.Some<A> => {
    deepStrictEqual(option, Option.some(expected))
  },
)

// ----------------------------
// Result
// ----------------------------

/**
 * Asserts that `result` is `Success` and contains a value equal to `expected`.
 *
 * @since 4.0.0
 */
export const assertSuccess: {
  <A, E>(result: Result.Result<A, E>, expected: A): asserts result is Result.Success<A, never>
  <A, E>(expected: A): (result: Result.Result<A, E>) => asserts result is Result.Success<A, never>
} = dual(
  (args) => args.length >= 2,
  <A, E>(result: Result.Result<A, E>, expected: A): asserts result is Result.Success<A, never> => {
    deepStrictEqual(result, Result.succeed(expected))
  },
)

/**
 * Asserts that `result` is `Failure` and contains an error equal to `expected`.
 *
 * @since 4.0.0
 */
export const assertFailure: {
  <A, E>(result: Result.Result<A, E>, expected: E): asserts result is Result.Failure<never, E>
  <A, E>(expected: E): (result: Result.Result<A, E>) => asserts result is Result.Failure<never, E>
} = dual(
  (args) => args.length >= 2,
  <A, E>(result: Result.Result<A, E>, expected: E): asserts result is Result.Failure<never, E> => {
    deepStrictEqual(result, Result.fail(expected))
  },
)

// ----------------------------
// Exit
// ----------------------------

/**
 * Asserts that `exit` is a failure with a cause equal to `expected`.
 *
 * @since 4.0.0
 */
export const assertExitFailure: {
  <A, E>(exit: Exit.Exit<A, E>, expected: Cause.Cause<E>): asserts exit is Exit.Failure<never, E>
  <A, E>(expected: Cause.Cause<E>): (exit: Exit.Exit<A, E>) => asserts exit is Exit.Failure<never, E>
} = dual(
  (args) => args.length >= 2,
  <A, E>(exit: Exit.Exit<A, E>, expected: Cause.Cause<E>): asserts exit is Exit.Failure<never, E> => {
    deepStrictEqual(exit, Exit.failCause(expected))
  },
)

/**
 * Asserts that `exit` is a success with a value equal to `expected`.
 *
 * @since 4.0.0
 */
export const assertExitSuccess: {
  <A, E>(exit: Exit.Exit<A, E>, expected: A): asserts exit is Exit.Success<A, never>
  <A, E>(expected: A): (exit: Exit.Exit<A, E>) => asserts exit is Exit.Success<A, never>
} = dual(
  (args) => args.length >= 2,
  <A, E>(exit: Exit.Exit<A, E>, expected: A): asserts exit is Exit.Success<A, never> => {
    deepStrictEqual(exit, Exit.succeed(expected))
  },
)
