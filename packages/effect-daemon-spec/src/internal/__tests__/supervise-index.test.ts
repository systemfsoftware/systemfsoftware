import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { failedIndexOf } from '../supervise-index.js'

describe('failedIndexOf', () => {
  it('Should_ReturnSum_When_GivenStartIdxAndOffset', () => {
    expect(failedIndexOf(0, 0)).toBe(0)
    expect(failedIndexOf(0, 5)).toBe(5)
    expect(failedIndexOf(3, 2)).toBe(5)
  })

  it('Should_ReturnExactSum_When_GivenAnyTwoNonNegativeInts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (startIdx, failedOffset) => failedIndexOf(startIdx, failedOffset) === startIdx + failedOffset,
      ),
    )
  })
})
