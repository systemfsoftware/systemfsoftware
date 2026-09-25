import type { ViteUserConfig } from 'vitest/config'

declare const sourceResolveConditions: ViteUserConfig
declare const sharedConfig: ViteUserConfig
declare const isCI: boolean
/**
 * Vitest's `defineConfig` with the package's conformance files split into a project of their own and
 * the guard added to every block that runs tests. Resolving the guard and finding the conformance files
 * read the file system, so the config it returns is a promise.
 */
declare const defineConfig: (config: ViteUserConfig) => Promise<ViteUserConfig>

export { defineConfig, isCI, sharedConfig, sourceResolveConditions }
export type { ViteUserConfig }
