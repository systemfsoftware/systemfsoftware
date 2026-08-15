import { describe, expect, it } from '@effect/vitest'
import { nextCall } from './ambient-source.kernel.js'

/** Pure with a structural codomain: two applications build two objects. */
const wrap = (n: number): { readonly value: number } => ({ value: n })

/** Pure and total, and `NaN` is in its image. */
const half = (n: number): number => n / 2

/**
 * The defect shape the law exists for. `nextCall` is imported, so a lint rule reading this
 * module resolves the name against this file's own declarations, finds nothing, and reports
 * nothing.
 */
const impureThroughImport = (n: number): number => n + nextCall()

describe('the asymmetry the law exists for', () => {
  it('Should_ViolateDeterminism_When_ImpurityIsReachedThroughAnImport', () => {
    // Exact rather than probabilistic: the imported source counts its calls.
    expect(impureThroughImport(0)).not.toBe(impureThroughImport(0))
  })
})

describe('why the comparison is Object.is and not ===', () => {
  it('Should_SatisfyTheLaw_When_PureFunctionReturnsNaN', () => {
    const left = half(Number.NaN)
    const right = half(Number.NaN)
    expect(Object.is(left, right)).toBe(true)
    // The reason the default changed: `===` reports this pure function as impure, and
    // `Arbitrary.make(S.Number)` draws NaN often enough to flake a 100-run property.
    expect(left === right).toBe(false)
  })
})

describe('why ruleOfPurityBy exists', () => {
  it('Should_NotBeIdentical_When_PureFunctionReturnsAStructure', () => {
    expect(Object.is(wrap(1), wrap(1))).toBe(false)
    expect(wrap(1)).toStrictEqual(wrap(1))
  })
})
