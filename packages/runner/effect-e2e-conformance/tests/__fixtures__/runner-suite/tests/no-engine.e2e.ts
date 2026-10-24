import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_Pass_When_TheScreenIsNeverTouched', ({ platform }) => {
  expect(platform).toBe('web')
})

test('Should_BeSkipped_When_TheTargetRunsOnWeb', { platforms: ['ios'] }, () => {
  expect.unreachable('a web target never runs an iOS-only test')
})
