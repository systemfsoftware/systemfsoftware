export { defineConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'

declare const sharedConfig: ViteUserConfig
declare const isCI: boolean

export { isCI, sharedConfig }
export type { ViteUserConfig }
