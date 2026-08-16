import { describe } from '@effect/vitest'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { ruleOfPurity, ruleOfPurityBy } from '../rule-of-purity.kernel.js'

/** A genuinely pure total function: the law must hold over its whole domain. */
const double = (n: number): number => n * 2

/** Pure with a structural codomain: two applications build two objects. */
const wrap = (n: number): { readonly value: number } => ({ value: n })

// The domain is intentionally all JS numbers: `S.Number` accepts `NaN` (and `±Infinity`),
// which is exactly why the law's default comparison is `Object.is` — see the kernel doc.
// @effect-diagnostics-next-line schemaNumber:off
const AnyNumber = S.Number
const numbers = S.toArbitrary(AnyNumber)(fc)

describe('ruleOfPurity', () => {
  ruleOfPurity('double', double, numbers)
  ruleOfPurityBy('wrap', wrap, numbers, (left, right) => Object.is(left.value, right.value))
})
