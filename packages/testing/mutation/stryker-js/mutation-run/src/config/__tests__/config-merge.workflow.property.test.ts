import { isDeepStrictEqual } from 'node:util'

import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'

import { mergeRecords } from '../config-merge.workflow.js'

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

describe('mergeRecords', () => {
  it.prop(
    '∀a,b,c_Merge_≡Associative',
    [flatRecordArb, flatRecordArb, flatRecordArb],
    ([a, b, c]) =>
      isDeepStrictEqual(
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
      return isDeepStrictEqual(Reflect.get(merged, key), right)
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
      return isDeepStrictEqual(mergedInner, expected)
    },
  )
})
