import { page } from 'vitest/browser'

export const Primary = {
  play: async (): Promise<void> => {
    await window.fetch('/demand')
    await page.screenshot()
  },
}
