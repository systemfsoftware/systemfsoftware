export const exampleTemplate = (): string =>
  `import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('the home page shows a heading', async ({ app, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('heading')).toBeVisible()
})
`
