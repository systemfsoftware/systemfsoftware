import * as Equivalence from 'effect/Equivalence'

import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'

import { mergeRecords } from '../Config.workflow.js'

const primitiveArb = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
)

const flatRecordArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 4 }),
  primitiveArb,
  { maxKeys: 5 },
)

const unknownEq: Equivalence.Equivalence<unknown> = Equivalence.make((a, b) => {
  if (Object.is(a, b)) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) && Array.isArray(b)) return Equivalence.Array(unknownEq)(a, b)
  if (Array.isArray(a) || Array.isArray(b)) return false
  const aKeys = Reflect.ownKeys(a)
  const bKeys = Reflect.ownKeys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false
    if (!unknownEq(Reflect.get(a, key), Reflect.get(b, key))) return false
  }
  return true
})

const recordEq = Equivalence.Record(unknownEq)

describe('mergeRecords', () => {
  it.prop(
    '∀a,b,c_Merge_≡Associative',
    [flatRecordArb, flatRecordArb, flatRecordArb],
    ([a, b, c]) =>
      recordEq(
        mergeRecords(mergeRecords(a, b), c),
        mergeRecords(a, mergeRecords(b, c)),
      ),
  )

  it.prop(
    '∀k,v_Merge_=RightBiased',
    [fc.string({ minLength: 1, maxLength: 4 }), primitiveArb, primitiveArb],
    ([key, left, right]) => {
      const l: Record<string, unknown> = { [key]: left }
      const r: Record<string, unknown> = { [key]: right }
      const merged = mergeRecords(l, r)
      return unknownEq(Reflect.get(merged, key), right)
    },
  )

  it.prop(
    '∀a,b_Merge_≡Recursive',
    [flatRecordArb, flatRecordArb, fc.string({ minLength: 1, maxLength: 3 })],
    ([aInner, bInner, sharedKey]) => {
      const a: Record<string, unknown> = { [sharedKey]: aInner }
      const b: Record<string, unknown> = { [sharedKey]: bInner }
      const merged = mergeRecords(a, b)
      const mergedInner: unknown = Reflect.get(merged, sharedKey)
      const expected = mergeRecords(aInner, bInner)
      return unknownEq(mergedInner, expected)
    },
  )
})
