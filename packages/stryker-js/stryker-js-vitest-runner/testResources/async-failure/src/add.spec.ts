import { describe, expect, it } from 'vitest'
import { add, addAsPromised } from './add.js'

describe(addAsPromised.name, () => {
  it('should be able to add two numbers', () => {
    const actual = addAsPromised(40, 2)
    actual.then((val) => {
      expect(val).toEqual(42)
    })
  })
})

describe(add.name, () => {
  it('should be able to add two numbers', () => {
    const actual = add(40, 0)
    expect(actual).toEqual(40)
  })
})
