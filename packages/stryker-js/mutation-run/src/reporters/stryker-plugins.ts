/**
 * The declared subpath whose generated entry wrapper the plugin loader imports.
 *
 * It exists to be an entry: a subpath tsdown emits a wrapper for re-exports
 * `strykerPlugins` under its real name, while the shared chunk holding the
 * registry's code mangles it. The barrel (`reporters/index.ts`) is not usable
 * for that job because it also exports `BroadcastReporter`, `StrictReporter`
 * and `reporterPluginsFileUrl`, none of which belong in the published surface
 * the loader reads — so the enumerated entry is this file, not the barrel (the
 * plan's U7 ruling, same shape as `utils/exit-classification.ts`).
 */
export { strykerPlugins } from './index.js'
