/**
 * The public API of this package: every name an adopter may import.
 *
 * There is one programmatic door. A name absent from here and from the two
 * declared subpaths - `./config/base`, the preset a config file names in
 * `extends`, and `./internal/*`, the worker entry points the engine spawns by
 * path - is internal and moves without a major, whatever file it sits in.
 */

// Run the engine.
export { RunEnvironment, type RunEnvironmentShape } from './run-environment.js'
export { defaultStages, makeRunLayer } from './run-layers.js'
export type { RunOutcome } from './run-stages/stage-results.js'
export { type MutationRunStages, runMutationTest, shouldKeepTempDir } from './stryker.js'

// Read and validate its configuration.
export * from './config/config-resolution.js'
export * from './config/fork-schema.js'

// Observe a run: its event stream, its verdict, its output mode, its exit class.
export * from './exit-classification.js'
export * from './output-mode.js'
export * from './run-event.js'
export * from './verdict-envelope.js'

// Diff sources for an incremental run.
export * from './mutants/incremental-differ.js'

// The failure identities a caller can catch (the config-read failures already
// arrive through ./config/config-resolution above).
export { StageError } from './run-stages/stage.schema.js'
export { StrykerError } from './stryker-error.schema.js'
export { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool/worker-pool.schema.js'

// This engine's version.
export { strykerEngines, strykerVersion } from './stryker-package.js'
