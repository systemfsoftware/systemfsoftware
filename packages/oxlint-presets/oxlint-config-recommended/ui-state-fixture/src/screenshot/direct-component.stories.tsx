import { page } from 'vitest/browser'

export const Primary = {
  play: async (): Promise<void> => {
    await page.screenshot({ path: 'primary.png' })
  },
}
