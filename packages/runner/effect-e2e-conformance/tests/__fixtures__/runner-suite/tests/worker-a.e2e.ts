import { beforeAll, expect, test } from '@systemfsoftware/effect-e2e/runner'

import { recordPoolSlot } from '../pool-slot.js'

beforeAll(recordPoolSlot)

test('Should_ReadTheFreePlan_When_WorkerAOpensBilling', async ({ app, screen }) => {
  await app.open('/settings/billing')
  await expect(screen.getByRole('status')).toContainText('Free')
})

test('Should_Pass_When_WorkerAChecksAValue', () => {
  expect(2 * 2).toBe(4)
})
