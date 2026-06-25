export { defineConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'

declare const sharedConfig: ViteUserConfig

export { sharedConfig }
export type { ViteUserConfig }
