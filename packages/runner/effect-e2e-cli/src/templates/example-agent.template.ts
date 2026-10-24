export const exampleAgentTemplate = (): string =>
  `import { test } from '@systemfsoftware/effect-e2e/runner'

import { agentSkip } from '../e2e.config.ts'

test('a visitor reaches the top of the home page', { skip: agentSkip }, async ({ app, agent }) => {
  await app.open('/')
  await agent.act('scroll to the top of the page')
  await agent.assert('the page shows a heading')
})
`
