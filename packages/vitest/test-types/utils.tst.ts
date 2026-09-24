import { describe, expect, it } from 'tstyche'
import { assertEquals, assertFalse, assertTrue, deepStrictEqual, notDeepStrictEqual, strictEqual } from '../src/utils'

describe('the equality helpers type a call the way they route it (R21)', () => {
  it('routes a pair of values data-first, and pins the type it returns', () => {
    expect(deepStrictEqual(1, 2)).type.toBe<void>()
    expect(notDeepStrictEqual(1, 2)).type.toBe<void>()
    expect(strictEqual(1, 2)).type.toBe<void>()
    expect(assertEquals(1, 2)).type.toBe<void>()
  })

  it('routes one value to the piped function, and pins the type it returns', () => {
    expect(deepStrictEqual(1)).type.toBe<(actual: number) => void>()
    expect(notDeepStrictEqual(1)).type.toBe<(actual: number) => void>()
    expect(strictEqual(1)).type.toBe<(actual: number) => void>()
    expect(assertEquals(1)).type.toBe<(actual: number) => void>()
  })

  it('refuses a message beside the pair it takes', () => {
    expect(deepStrictEqual).type.toBeCallableWith(1, 2)
    expect(deepStrictEqual).type.not.toBeCallableWith(1, 2, 'compare values')
    expect(notDeepStrictEqual).type.toBeCallableWith(1, 2)
    expect(notDeepStrictEqual).type.not.toBeCallableWith(1, 2, 'compare values')
    expect(strictEqual).type.toBeCallableWith(1, 2)
    expect(strictEqual).type.not.toBeCallableWith(1, 2, 'compare values')
    expect(assertEquals).type.toBeCallableWith(1, 2)
    expect(assertEquals).type.not.toBeCallableWith(1, 2, 'compare values')
  })
})

describe('assertTrue takes a boolean value and a message, never either in the other place', () => {
  it('routes the message data-last, and pins the type it returns', () => {
    expect(assertTrue('the value must be true')).type.toBe<(self: boolean) => asserts self>()
    expect(assertTrue(true)).type.toBe<void>()
  })

  it('refuses a non-boolean value next to the boolean it takes', () => {
    expect(assertTrue).type.toBeCallableWith(true)
    expect(assertTrue).type.not.toBeCallableWith(1)
  })
})

describe('assertFalse takes a boolean value and a message, never either in the other place', () => {
  it('routes the message data-last, and pins the type it returns', () => {
    expect(assertFalse('the value must be false')).type.toBe<(self: boolean) => void>()
    expect(assertFalse(false)).type.toBe<void>()
  })

  it('refuses a non-boolean value next to the boolean it takes', () => {
    expect(assertFalse).type.toBeCallableWith(false)
    expect(assertFalse).type.not.toBeCallableWith(0)
  })
})
