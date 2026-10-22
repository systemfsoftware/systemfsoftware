import { Equal, Predicate } from 'effect'
import { AssertionFailed } from './errors.schema.js'

const show = <A>(value: A): string => {
  const shown: string | undefined = value === undefined ? undefined : JSON.stringify(value)
  return shown ?? String(value)
}

const isFalsy = <A>(value: A): boolean =>
  value === undefined || value === null || value === false || value === 0 || value === '' ||
  Number.isNaN(value)

export interface Matchers<A> {
  readonly toBe: (expected: A) => void
  readonly toEqual: (expected: A) => void
  readonly toBeTruthy: () => void
  readonly toBeFalsy: () => void
  readonly toBeNull: () => void
  readonly toBeUndefined: () => void
  readonly toBeDefined: () => void
  readonly toContain: <E>(expected: E) => void
  readonly toMatch: (expected: string | RegExp) => void
  readonly toBeGreaterThan: (expected: number) => void
  readonly toBeGreaterThanOrEqual: (expected: number) => void
  readonly toBeLessThan: (expected: number) => void
  readonly toBeLessThanOrEqual: (expected: number) => void
  readonly toHaveLength: (expected: number) => void
  readonly toBeCloseTo: (expected: number, precision?: number) => void
}

export interface Expectation<A> extends Matchers<A> {
  readonly not: Matchers<A>
}

const check = <E, A>(matcher: string, inverted: boolean, passed: boolean, expected: E, actual: A): void => {
  if (passed === inverted) {
    throw new AssertionFailed({ message: `${matcher} failed`, expected: show(expected), actual: show(actual) })
  }
}

const contains = <A, E>(actual: A, expected: E): boolean => {
  if (Predicate.isString(actual) && Predicate.isString(expected)) return actual.includes(expected)
  if (Predicate.isString(actual) && expected instanceof RegExp) return expected.test(actual)
  return Array.isArray(actual) && actual.some((item) => Equal.equals(item, expected))
}

const compare = <A>(actual: A, holds: (value: number) => boolean): boolean =>
  Predicate.isNumber(actual) && holds(actual)

const lengthOf = <A>(actual: A): number | undefined =>
  Predicate.isString(actual) || Array.isArray(actual) ? actual.length : undefined

const matchersFor = <A>(actual: A, inverted: boolean): Matchers<A> => ({
  toBe: (expected) => check('toBe', inverted, Object.is(actual, expected), expected, actual),
  toEqual: (expected) => check('toEqual', inverted, Equal.equals(actual, expected), expected, actual),
  toBeTruthy: () => check('toBeTruthy', inverted, !isFalsy(actual), 'truthy', actual),
  toBeFalsy: () => check('toBeFalsy', inverted, isFalsy(actual), 'falsy', actual),
  toBeNull: () => check('toBeNull', inverted, actual === null, null, actual),
  toBeUndefined: () => check('toBeUndefined', inverted, actual === undefined, undefined, actual),
  toBeDefined: () => check('toBeDefined', inverted, actual !== undefined, 'defined', actual),
  toContain: (expected) => check('toContain', inverted, contains(actual, expected), expected, actual),
  toMatch: (expected) =>
    check('toMatch', inverted, Predicate.isString(actual) && actual.match(expected) !== null, expected, actual),
  toBeGreaterThan: (expected) =>
    check('toBeGreaterThan', inverted, compare(actual, (value) => value > expected), expected, actual),
  toBeGreaterThanOrEqual: (expected) =>
    check('toBeGreaterThanOrEqual', inverted, compare(actual, (value) => value >= expected), expected, actual),
  toBeLessThan: (expected) =>
    check('toBeLessThan', inverted, compare(actual, (value) => value < expected), expected, actual),
  toBeLessThanOrEqual: (expected) =>
    check('toBeLessThanOrEqual', inverted, compare(actual, (value) => value <= expected), expected, actual),
  toHaveLength: (expected) => check('toHaveLength', inverted, lengthOf(actual) === expected, expected, actual),
  toBeCloseTo: (expected, precision = 2) =>
    check(
      'toBeCloseTo',
      inverted,
      compare(actual, (value) => Math.abs(value - expected) < Math.pow(10, -precision) / 2),
      expected,
      actual,
    ),
})

export const expect = <A>(actual: A): Expectation<A> => ({
  ...matchersFor(actual, false),
  not: matchersFor(actual, true),
})
