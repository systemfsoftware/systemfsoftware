import { describe } from '@effect/vitest'
import { Arbitrary, Schema as S } from 'effect'
import { ruleOfPurity, ruleOfPurityBy } from '../rule-of-purity.kernel.js'

/** A genuinely pure total function: the law must hold over its whole domain. */
const double = (n: number): number => n * 2

/** Pure with a structural codomain: two applications build two objects. */
const wrap = (n: number): { readonly value: number } => ({ value: n })

const AnyNumber = S.Number
const numbers = Arbitrary.make(AnyNumber)

describe('ruleOfPurity', () => {
  ruleOfPurity('double', double, numbers)
  ruleOfPurityBy('wrap', wrap, numbers, (left, right) => Object.is(left.value, right.value))
})
