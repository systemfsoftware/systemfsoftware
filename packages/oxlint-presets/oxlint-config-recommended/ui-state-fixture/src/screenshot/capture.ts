import { page } from 'vitest/browser'

export const capture = async (): Promise<string> => page.screenshot()
