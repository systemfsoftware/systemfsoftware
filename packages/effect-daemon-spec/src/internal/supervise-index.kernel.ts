const indexSum = (startIdx: number, failedOffset: number): number => startIdx + failedOffset

export const failedIndexOf = indexSum

if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = await import('vitest')
  const { it: itEffect } = await import('@systemfsoftware/effect-gherkin-spec')
  const { FastCheck: fc } = await import('effect')

  describe('failedIndexOf', () => {
    it('Should_ReturnSum_When_GivenStartIdxAndOffset', () => {
      expect(indexSum(0, 0)).toBe(0)
      expect(indexSum(0, 5)).toBe(5)
      expect(indexSum(3, 2)).toBe(5)
    })
  })

  itEffect.prop(
    '∀ab_FailedIndex_=Sum',
    [fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 })],
    ([startIdx, failedOffset]) => failedIndexOf(startIdx, failedOffset) === startIdx + failedOffset,
  )
}
