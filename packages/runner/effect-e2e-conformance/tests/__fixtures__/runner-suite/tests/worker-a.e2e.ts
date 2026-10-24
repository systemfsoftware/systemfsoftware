import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_ReadTheFreePlan_When_WorkerAOpensBilling', async ({ app, screen }) => {
  await app.open('/settings/billing')
  await expect(screen.getByRole('status')).toContainText('Free')
})

test('Should_Pass_When_WorkerAChecksAValue', () => {
  expect(2 * 2).toBe(4)
})
