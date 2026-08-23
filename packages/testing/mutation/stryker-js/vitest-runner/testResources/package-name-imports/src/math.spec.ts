import { add, subtract } from '@fixture/math'
import { describe, expect, test } from 'vitest'

describe('math', () => {
  test('should support simple addition', () => {
    expect(add(1, 2)).toBe(3)
  })
  test('should support simple subtraction', () => {
    expect(subtract(5, 2)).toBe(3)
  })
})
