import { test } from '@systemfsoftware/effect-e2e/runner'

import { PLANTED_SECRET } from '../site.js'

test('Should_FailOnTheModel_When_TheAgentActsWithThePlantedSecret', async ({ app, agent }) => {
  await app.open('/settings/billing')
  await agent.act(`press Upgrade for ${PLANTED_SECRET}`)
})
