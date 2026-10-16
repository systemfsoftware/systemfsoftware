import { expect, test } from 'vitest'
import { answer } from '../src/answer.js'

test('the answer is 42', () => {
  expect(answer()).toBe(42)
})

test('doubt negates it', () => {
  expect(answer(true)).toBe(-42)
})
