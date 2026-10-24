import { expect, test } from '@systemfsoftware/effect-e2e/runner'

const tries = { count: 0 }

test('Should_Pass_When_TheRetryHolds', { retries: 1 }, () => {
  tries.count += 1
  expect(tries.count).toBe(2)
})
