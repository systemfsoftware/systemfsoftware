import { describe, expect, test } from 'vitest'
import { addOne } from '../math'

describe('math', () => {
  test('should be able to add one to a number', function() {
    var number = 2
    var expected = 3

    var actual = addOne(number)

    expect(actual).toBe(expected)
  })
})
