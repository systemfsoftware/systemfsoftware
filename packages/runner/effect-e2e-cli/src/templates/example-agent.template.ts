export const exampleAgentTemplate = (): string =>
  `import { test } from '@systemfsoftware/effect-e2e/runner'

import { agentSkip } from '../e2e.config.ts'

test('Should_ReachTheTopOfThePage_When_TheAgentScrolls', { skip: agentSkip }, async ({ app, agent }) => {
  await app.open('/')
  await agent.act('scroll to the top of the page')
  await agent.assert('the page shows a heading')
})
`
