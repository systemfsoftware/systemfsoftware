import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_Pass_When_ItRunsBeforeTheWorkerDies', () => {
  expect(1 + 1).toBe(2)
})

test('Should_NeverFinish_When_ItsWorkerIsKilled', () => {
  process.kill(process.pid, 'SIGKILL')
})
