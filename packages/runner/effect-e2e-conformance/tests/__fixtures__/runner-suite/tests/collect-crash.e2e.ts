import { expect, test } from '@systemfsoftware/effect-e2e/runner'

process.kill(process.pid, 'SIGKILL')

test('Should_NeverRun_When_ItsWorkerDiesWhileCollectingTheFile', () => {
  expect(1 + 1).toBe(2)
})
