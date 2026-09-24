import type { ViteUserConfig } from 'vitest/config'

declare const sourceResolveConditions: ViteUserConfig
declare const sharedConfig: ViteUserConfig
declare const isCI: boolean
/** Vitest's `defineConfig` with the conformance coverage gate added to the config's plugins. */
declare const defineConfig: (config: ViteUserConfig) => ViteUserConfig
declare const guardSetupFiles: ReadonlyArray<string>

export { defineConfig, guardSetupFiles, isCI, sharedConfig, sourceResolveConditions }
export type { ViteUserConfig }
