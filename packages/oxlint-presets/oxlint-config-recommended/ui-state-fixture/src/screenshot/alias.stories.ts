import { page as browserPage } from 'vitest/browser'

export const capture = async (): Promise<string> => browserPage.screenshot()
