import { describe, expect, test } from 'vitest'
import { add } from '../math'

describe('math', () => {
  test('should be able to add two numbers', function() {
    var num1 = 2
    var num2 = 5
    var expected = num1 + num2

    var actual = add(num1, num2)

    expect(actual).toBe(expected)
  })
})
