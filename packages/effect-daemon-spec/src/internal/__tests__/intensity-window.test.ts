import { describe, expect, it } from 'vitest'
import { exceedsRestarts, isWithinWindow, pruneTimestamps, recordTimestamp } from '../intensity-window.js'

describe('isWithinWindow', () => {
  it('Should_ReturnTrue_When_DeltaEqualsWindow', () => {
    expect(isWithinWindow(100, 10)(90)).toBe(true)
  })

  it('Should_ReturnTrue_When_DeltaLessThanWindow', () => {
    expect(isWithinWindow(100, 10)(95)).toBe(true)
  })

  it('Should_ReturnFalse_When_DeltaExceedsWindow', () => {
    expect(isWithinWindow(100, 10)(89)).toBe(false)
    expect(isWithinWindow(100, 10)(0)).toBe(false)
  })
})

describe('pruneTimestamps', () => {
  it('Should_KeepAll_When_AllWithinWindow', () => {
    expect(pruneTimestamps([95, 96, 97], 100, 10)).toEqual([95, 96, 97])
  })

  it('Should_DropExpired_When_DeltaExceedsWindow', () => {
    expect(pruneTimestamps([50, 90, 95], 100, 10)).toEqual([90, 95])
  })

  it('Should_KeepBoundaryEntry_When_DeltaEqualsWindow', () => {
    expect(pruneTimestamps([90, 95], 100, 10)).toEqual([90, 95])
  })

  it('Should_DropBoundaryMinusOne_When_DeltaIsOneAboveWindow', () => {
    expect(pruneTimestamps([89, 90], 100, 10)).toEqual([90])
  })

  it('Should_ReturnEmpty_When_AllExpired', () => {
    expect(pruneTimestamps([0, 10, 20], 100, 5)).toEqual([])
  })
})

describe('recordTimestamp', () => {
  it('Should_PrependNow_When_RecordingNew', () => {
    expect(recordTimestamp([95], 100, 10)).toEqual([100, 95])
  })

  it('Should_PruneExpired_When_RecordingNew', () => {
    expect(recordTimestamp([50, 95], 100, 10)).toEqual([100, 95])
  })
})

describe('exceedsRestarts', () => {
  it('Should_ReturnTrue_When_CountStrictlyExceedsRestarts', () => {
    expect(exceedsRestarts(6, 5)).toBe(true)
  })

  it('Should_ReturnFalse_When_CountEqualsRestarts', () => {
    expect(exceedsRestarts(5, 5)).toBe(false)
  })

  it('Should_ReturnFalse_When_CountBelowRestarts', () => {
    expect(exceedsRestarts(0, 5)).toBe(false)
    expect(exceedsRestarts(4, 5)).toBe(false)
  })
})
