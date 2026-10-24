import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_Fail_When_TheStatusNeverReadsPro', async ({ app, screen }) => {
  await app.open('/settings/billing')
  await expect(screen.getByRole('status')).toContainText('Pro')
})

test('Should_FailThroughVitest_When_TwoValuesDiffer', () => {
  expect(1 + 1).toBe(3)
})
