import { describe, expect, test } from 'vitest'
import { identity } from './other.ts'

describe('other', () => {
  test('should return the value', () => {
    expect(identity('x')).toBe('x')
  })
})
