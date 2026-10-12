import { page } from 'vitest/browser'

const { screenshot } = page

export const Primary = {
  play: async (): Promise<void> => {
    await screenshot()
  },
}
