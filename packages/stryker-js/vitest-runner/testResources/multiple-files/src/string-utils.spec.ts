import { describe, expect, test } from 'vitest'
import { capitalize } from './string-utils.ts'

describe('string-utils', () => {
  test('should capitalize the first letter', () => {
    expect(capitalize('hello world')).toBe('Hello world')
  })
})
