import type { ViteUserConfig } from 'vitest/config'

declare const sourceResolveConditions: ViteUserConfig
declare const sharedConfig: ViteUserConfig
declare const isCI: boolean
/** Vitest's `defineConfig` with the conformance coverage gate added to the config's plugins. */
declare const defineConfig: (config: ViteUserConfig) => ViteUserConfig
/**
 * The setup files that install the fork's guard: the resolved `@effect/vitest/guard` for every package,
 * empty only for a package the exemption table names in full, and an error thrown at load when a package
 * cannot resolve it.
 */
declare const guardSetupFiles: ReadonlyArray<string>

export { defineConfig, guardSetupFiles, isCI, sharedConfig, sourceResolveConditions }
export type { ViteUserConfig }
