import { Arbitrary, Either, ParseResult, Schema } from 'effect'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DecideInput } from '../restart-decision.schema.js'

const decode = Schema.decodeUnknownEither(DecideInput)

const baseValid = {
  strategy: 'one_for_one' as const,
  exitSuccess: false,
  intensityExceeded: false,
}

describe('DecideInput schema — required fields', () => {
  it('Should_FailDecode_When_FieldsObjectIsEmpty', () => {
    expect(decode({})).toEqual(Either.left(expect.anything()))
  })

  it('Should_FailDecode_When_StrategyMissing', () => {
    expect(decode({ totalChildren: 3, failedIndex: 0, exitSuccess: false, intensityExceeded: false }))
      .toEqual(Either.left(expect.anything()))
  })

  it('Should_FailDecode_When_TotalChildrenMissing', () => {
    expect(decode({ ...baseValid, failedIndex: 0 })).toEqual(Either.left(expect.anything()))
  })

  it('Should_FailDecode_When_FailedIndexMissing', () => {
    expect(decode({ ...baseValid, totalChildren: 3 })).toEqual(Either.left(expect.anything()))
  })
})

describe('DecideInput schema — failedIndex < totalChildren filter', () => {
  it('Should_AcceptDecode_When_FailedIndexBelowTotalChildren', () => {
    expect(decode({ ...baseValid, totalChildren: 3, failedIndex: 0 }))
      .toEqual(Either.right({ ...baseValid, totalChildren: 3, failedIndex: 0 }))
    expect(decode({ ...baseValid, totalChildren: 3, failedIndex: 2 }))
      .toEqual(Either.right({ ...baseValid, totalChildren: 3, failedIndex: 2 }))
  })

  it('Should_FailDecode_When_FailedIndexEqualsTotalChildren', () => {
    expect(decode({ ...baseValid, totalChildren: 3, failedIndex: 3 }))
      .toEqual(Either.left(expect.anything()))
  })

  it('Should_FailDecode_When_FailedIndexExceedsTotalChildren', () => {
    expect(decode({ ...baseValid, totalChildren: 3, failedIndex: 4 }))
      .toEqual(Either.left(expect.anything()))
    expect(decode({ ...baseValid, totalChildren: 1, failedIndex: 10 }))
      .toEqual(Either.left(expect.anything()))
  })

  it('Should_IncludeMessage_When_FilterRejects', () => {
    const result = decode({ ...baseValid, totalChildren: 3, failedIndex: 3 })
    const message = Either.match(result, {
      onLeft: (e) => ParseResult.TreeFormatter.formatErrorSync(e),
      onRight: () => '',
    })
    expect(message).toContain('failedIndex must be < totalChildren')
  })
})

describe('DecideInput schema — totalChildren bounds', () => {
  it('Should_AcceptDecode_When_TotalChildrenIs1', () => {
    expect(decode({ ...baseValid, totalChildren: 1, failedIndex: 0 }))
      .toEqual(Either.right({ ...baseValid, totalChildren: 1, failedIndex: 0 }))
  })

  it('Should_AcceptDecode_When_TotalChildrenIs10', () => {
    expect(decode({ ...baseValid, totalChildren: 10, failedIndex: 9 }))
      .toEqual(Either.right({ ...baseValid, totalChildren: 10, failedIndex: 9 }))
  })

  it('Should_FailDecode_When_TotalChildrenIs0', () => {
    expect(decode({ ...baseValid, totalChildren: 0, failedIndex: 0 }))
      .toEqual(Either.left(expect.anything()))
  })

  it('Should_FailDecode_When_TotalChildrenExceedsMax', () => {
    expect(decode({ ...baseValid, totalChildren: 11, failedIndex: 0 }))
      .toEqual(Either.left(expect.anything()))
  })
})

describe('DecideInput arbitrary — generated values respect filter', () => {
  it('Should_GenerateOnlyValidValues_When_SampledFromArbitrary', () => {
    const arb = Arbitrary.make(DecideInput)
    fc.assert(
      fc.property(arb, (input) =>
        input.failedIndex < input.totalChildren &&
        input.totalChildren >= 1 &&
        input.totalChildren <= 10 &&
        input.failedIndex >= 0),
    )
  })

  it('Should_HitFailedIndexEqualsTotalMinusOne_When_Sampled', () => {
    const arb = Arbitrary.make(DecideInput)
    let hitMaxBoundary = false
    fc.assert(
      fc.property(arb, (input) => {
        if (input.failedIndex === input.totalChildren - 1) hitMaxBoundary = true
        return true
      }),
    )
    expect(hitMaxBoundary).toBe(true)
  })
})
