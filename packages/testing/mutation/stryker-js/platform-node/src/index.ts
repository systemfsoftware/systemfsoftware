/**
 * The public API of this package: every name an adopter may import.
 *
 * There is one programmatic door. A name absent from here and from the two
 * declared subpaths - `./config/base`, the preset a config file names in
 * `extends`, and `./internal/*`, the worker entry points the engine spawns by
 * path - is internal and moves without a major, whatever file it sits in.
 */

// Run the engine.
export { type CheckerResourceService, checkGroupedPlans } from './Checker.js'
export { RunEnvironment, type RunEnvironmentShape } from './Run.js'
export { makeRunLayer } from './Run.js'
export type { DryRunDone, InstrumentDone, PrepareDone, RunOutcome } from './Run.js'
export { runMutationTest, shouldKeepTempDir } from './Run.js'

// Read and validate its configuration.
export * from './Config.js'
export * from './Config.schema.js'

// Observe a run: its event stream, its verdict, its output mode.
export * from './output-mode.js'
export * from './verdict-envelope.js'

// Diff sources for an incremental run.
export { toRelativeNormalizedFileName } from './IncrementalDiff.workflow.js'
// The decoder for a persisted incremental file — adopter-facing surface, not wiring: the
// reader decodes through it and adopts it as the wire contract of the on-disk report.
export { IncrementalReportSchema } from './IncrementalReport.workflow.js'

// The failure identities a caller can catch (the config-read failures already
// arrive through ./config/config-resolution above).
export { nodeModuleLayer } from './NodeModule.js'
export { StageError } from './Run.schema.js'
export { StrykerError } from './stryker-error.schema.js'
export { ChildProcessCrashedError, OutOfMemoryError } from './Worker.schema.js'

// This engine's version.
export { strykerEngines, strykerVersion } from './stryker-package.js'
