import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_Pass_When_WorkerBChecksAValue', () => {
  expect(3 * 3).toBe(9)
})

test('Should_Fail_When_WorkerBExpectsAWrongSum', () => {
  expect(2 + 2).toBe(5)
})
