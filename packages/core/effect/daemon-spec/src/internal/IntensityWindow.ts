/** @internal */
export const isWithinWindow = (now: number, windowMillis: number) => (t: number): boolean => now - t <= windowMillis

const keepWithin = (now: number, windowMillis: number) =>
(
  ts: readonly number[],
): readonly number[] => ts.filter(isWithinWindow(now, windowMillis))

/** @internal */
export const pruneTimestamps = (
  ts: readonly number[],
  now: number,
  windowMillis: number,
): readonly number[] => keepWithin(now, windowMillis)(ts)

/** @internal */
export const recordTimestamp = (
  ts: readonly number[],
  now: number,
  windowMillis: number,
): readonly number[] => [now, ...pruneTimestamps(ts, now, windowMillis)]

/** @internal */
export const exceedsRestarts = (count: number, restarts: number): boolean => count > restarts

if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = await import('vitest')

  describe('isWithinWindow', () => {
    it('Should_ReturnTrue_When_DeltaEqualsWindow', () => {
      expect(isWithinWindow(100, 10)(90)).toMatchInlineSnapshot(`true`)
    })

    it('Should_ReturnTrue_When_DeltaLessThanWindow', () => {
      expect(isWithinWindow(100, 10)(95)).toMatchInlineSnapshot(`true`)
    })

    it('Should_ReturnFalse_When_DeltaExceedsWindow', () => {
      expect(isWithinWindow(100, 10)(89)).toMatchInlineSnapshot(`false`)
      expect(isWithinWindow(100, 10)(0)).toMatchInlineSnapshot(`false`)
    })
  })

  describe('pruneTimestamps', () => {
    it('Should_KeepAll_When_AllWithinWindow', () => {
      expect(pruneTimestamps([95, 96, 97], 100, 10)).toMatchInlineSnapshot(`
        [
          95,
          96,
          97,
        ]
      `)
      expect(keepWithin(100, 10)([95, 96, 97])).toMatchInlineSnapshot(`
        [
          95,
          96,
          97,
        ]
      `)
    })

    it('Should_DropExpired_When_DeltaExceedsWindow', () => {
      expect(pruneTimestamps([50, 90, 95], 100, 10)).toMatchInlineSnapshot(`
        [
          90,
          95,
        ]
      `)
    })

    it('Should_KeepBoundaryEntry_When_DeltaEqualsWindow', () => {
      expect(pruneTimestamps([90, 95], 100, 10)).toMatchInlineSnapshot(`
        [
          90,
          95,
        ]
      `)
    })

    it('Should_DropBoundaryMinusOne_When_DeltaIsOneAboveWindow', () => {
      expect(pruneTimestamps([89, 90], 100, 10)).toMatchInlineSnapshot(`
        [
          90,
        ]
      `)
    })

    it('Should_ReturnEmpty_When_AllExpired', () => {
      expect(pruneTimestamps([0, 10, 20], 100, 5)).toMatchInlineSnapshot(`[]`)
    })
  })

  describe('recordTimestamp', () => {
    it('Should_PrependNow_When_RecordingNew', () => {
      expect(recordTimestamp([95], 100, 10)).toMatchInlineSnapshot(`
        [
          100,
          95,
        ]
      `)
    })

    it('Should_PruneExpired_When_RecordingNew', () => {
      expect(recordTimestamp([50, 95], 100, 10)).toMatchInlineSnapshot(`
        [
          100,
          95,
        ]
      `)
    })
  })

  describe('exceedsRestarts', () => {
    it('Should_ReturnTrue_When_CountStrictlyExceedsRestarts', () => {
      expect(exceedsRestarts(6, 5)).toMatchInlineSnapshot(`true`)
    })

    it('Should_ReturnFalse_When_CountEqualsRestarts', () => {
      expect(exceedsRestarts(5, 5)).toMatchInlineSnapshot(`false`)
    })

    it('Should_ReturnFalse_When_CountBelowRestarts', () => {
      expect(exceedsRestarts(0, 5)).toMatchInlineSnapshot(`false`)
      expect(exceedsRestarts(4, 5)).toMatchInlineSnapshot(`false`)
    })
  })
}
