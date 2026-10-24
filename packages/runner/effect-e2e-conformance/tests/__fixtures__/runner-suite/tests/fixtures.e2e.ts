import { expect, test } from '@systemfsoftware/effect-e2e'

test('Should_ReceiveAppAgentScreenAndPlatform_When_TheE2eRunnerIsSelected', async ({ app, agent, screen, platform }) => {
  expect(typeof agent.act).toBe('function')
  expect(platform).toBe('web')
  await app.open('/settings/billing')
  await expect(screen.getByRole('status')).toContainText('Free')
})
