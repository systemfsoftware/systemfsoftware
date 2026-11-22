/**
 * @internal The `test.provide` keys the runner reads in a worker and the `./vite` plugin and the shared config fill
 * in the main process. This module imports nothing from Vitest's runtime, so the main process loads it unchanged.
 */
import type { ProvidedCheckDefaults } from './property/defaults.js'

/** @internal */
export const packageKey = '@systemfsoftware/vitest:package'

/** @internal */
export const workspaceRootKey = '@systemfsoftware/vitest:workspace-root'

/** @internal The commit the run checked out, published by the `./vite` plugin in the main process. */
export const commitKey = '@systemfsoftware/vitest:commit'

/** @internal The config file the run loaded, published by the `./vite` plugin. */
export const configFileKey = '@systemfsoftware/vitest:config-file'

/** @internal The directory of the package the config belongs to, published by the `./vite` plugin. */
export const packageRootKey = '@systemfsoftware/vitest:package-root'

declare module 'vitest' {
  interface ProvidedContext {
    '@systemfsoftware/vitest:property-check'?: ProvidedCheckDefaults
    [packageKey]?: string
    [workspaceRootKey]?: string
    [commitKey]?: string
    [configFileKey]?: string
    [packageRootKey]?: string
  }
}
