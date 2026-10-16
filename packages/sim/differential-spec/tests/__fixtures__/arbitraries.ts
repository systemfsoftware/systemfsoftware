import * as fc from 'fast-check'

export const integers = fc.integer()

export const integerLists: fc.Arbitrary<number[]> = fc.array(fc.integer(), { maxLength: 20 })
