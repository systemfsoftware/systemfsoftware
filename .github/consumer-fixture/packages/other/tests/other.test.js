import { expect, test } from 'vitest'
import { other } from '../src/other.js'

test('other names itself', () => {
  expect(other()).toBe('other')
})
