import { describe, expect, test } from 'vitest'
import { add } from './math.js'

describe('math', () => {
  test('should be 5 for add(2, 3)', function() {
    expect(add(2, 3)).toBe(5)
  })
})
