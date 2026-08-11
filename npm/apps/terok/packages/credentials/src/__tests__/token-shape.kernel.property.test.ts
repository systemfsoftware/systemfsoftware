import { it } from '@effect/vitest'
import { FastCheck as fc, Option } from 'effect'
import * as A from 'effect/Array'
import { describe } from 'vitest'
import { duplicateOf, parseIndex, splitTokens, uniqueBy } from '../token-shape.kernel.js'

const isSubsequence = (sub: ReadonlyArray<string>, full: ReadonlyArray<string>): boolean => {
  let cursor = 0
  for (const value of full) {
    if (value === sub[cursor]) cursor += 1
  }
  return cursor === sub.length
}

describe('splitTokens', () => {
  it.prop(
    '∀s_SplitTokens_⊆Segments',
    [fc.string()],
    ([input]) => {
      const trimmedSegments = input.split(',').map((segment) => segment.trim())
      return A.every(
        splitTokens(input),
        (token) => token.length > 0 && trimmedSegments.includes(token),
      )
    },
  )

  it.prop(
    '∀s_SplitTokens_⊇Segments',
    [fc.string()],
    ([input]) => {
      const actual = splitTokens(input)
      const expected = input
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
      return actual.length === expected.length && A.every(actual, (token, index) => token === expected[index])
    },
  )

  it.prop(
    '∀s_SplitTokens_∘Rejoin',
    [fc.string()],
    ([input]) => {
      const actual = splitTokens(input)
      const rejoined = splitTokens(actual.join(','))
      return actual.length === rejoined.length && A.every(actual, (token, index) => token === rejoined[index])
    },
  )
})

describe('parseIndex', () => {
  it.prop(
    '∀t_ParseIndex_=Digits',
    [fc.string()],
    ([token]) => {
      const parsed = parseIndex(token)
      const allDigits = /^[0-9]+$/.test(token)
      if (Option.isSome(parsed)) {
        return allDigits && parsed.value === Number(token)
      }
      return !allDigits
    },
  )
})

describe('uniqueBy', () => {
  it.prop(
    '∀x_UniqueBy_⊆Input',
    [fc.array(fc.string(), { maxLength: 8 })],
    ([values]) => isSubsequence(uniqueBy(values, (value) => value), values),
  )

  it.prop(
    '∀x_UniqueByKeys_≠Dup',
    [fc.array(fc.string(), { maxLength: 8 })],
    ([values]) => {
      const result = uniqueBy(values, (value) => value)
      return new Set(result).size === result.length
    },
  )

  it.prop(
    '∀x_UniqueBy_⊇First',
    [fc.array(fc.string(), { maxLength: 8 })],
    ([values]) => {
      const result = uniqueBy(values, (value) => value)
      return A.every(values, (value, index) => values.indexOf(value) === index ? result.includes(value) : true)
    },
  )
})

describe('duplicateOf', () => {
  it.prop(
    '∀v_DuplicateOf_⊥Distinct',
    [fc.array(fc.string(), { maxLength: 10 })],
    ([values]) => {
      const allDistinct = new Set(values).size === values.length
      return Option.isNone(duplicateOf(values)) === allDistinct
    },
  )

  it.prop(
    '∀v_DuplicateOf_∈RepeatSet',
    [fc.array(fc.string(), { maxLength: 10 })],
    ([values]) => {
      const found = duplicateOf(values)
      if (Option.isNone(found)) return true
      const first = values.indexOf(found.value)
      return A.some(values, (value, index) => index !== first && value === found.value)
    },
  )

  it.prop(
    '∀v_DuplicateOf_=FirstRepeat',
    [fc.array(fc.string(), { maxLength: 10 })],
    ([values]) => {
      const found = duplicateOf(values)
      if (Option.isNone(found)) return true
      const first = values.indexOf(found.value)
      return A.every(values, (value, index) => index > first || values.indexOf(value) === index)
    },
  )
})
