export const exampleTemplate = (): string =>
  `import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('Should_ShowAHeading_When_TheHomePageOpens', async ({ app, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('heading')).toBeVisible()
})
`
