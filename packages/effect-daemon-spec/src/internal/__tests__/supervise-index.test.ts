import { describe, expect, it } from 'vitest'
import { failedIndexOf } from '../supervise-index.js'

describe('failedIndexOf', () => {
  it('Should_ReturnSum_When_GivenStartIdxAndOffset', () => {
    expect(failedIndexOf(0, 0)).toBe(0)
    expect(failedIndexOf(0, 5)).toBe(5)
    expect(failedIndexOf(3, 2)).toBe(5)
  })
})
