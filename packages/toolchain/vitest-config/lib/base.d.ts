import type { ViteUserConfig } from 'vitest/config'

declare const sourceResolveConditions: ViteUserConfig
declare const sharedConfig: ViteUserConfig
declare const isCI: boolean
/**
 * Vitest's `defineConfig` with the conformance coverage gate added to the config's plugins, and the
 * guard and the conformance handoff added to every block that runs tests. Resolving the guard reads the
 * file system, so the config it returns is a promise.
 */
declare const defineConfig: (config: ViteUserConfig) => Promise<ViteUserConfig>

export { defineConfig, isCI, sharedConfig, sourceResolveConditions }
export type { ViteUserConfig }
