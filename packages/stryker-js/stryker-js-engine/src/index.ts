export { type CheckerResourceService, checkGroupedPlans } from './Checker.js'
export { RunEnvironment, type RunEnvironmentShape } from './Run.js'
export { idGeneratorLayer } from './Run.js'
export type { DryRunDone, InstrumentDone, PrepareDone, PrepareExecutorArgs, RunOutcome, StageServices } from './Run.js'
export { mutationRun, shouldKeepTempDir } from './Run.js'

export { defaultOptions, readConfig } from './Config.js'
export {
  ConfigDocumentSchema,
  ConfigError,
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
  extendsPropertySchema,
  forkOptionsSchema,
  ImportedModuleSchema,
  MergeCommand,
  MergeResult,
  ReadConfigCommand,
  survivorsPriorReport,
} from './Config.schema.js'
export type { ModeSignal, OutputMode, ResolvedMode } from './output-mode.js'
export { buildVerdictEnvelope, generateRunId, VERDICT_ENVELOPE_SCHEMA_VERSION } from './verdict-envelope.js'
export type { VerdictEnvelope } from './verdict-envelope.js'

export { toRelativeNormalizedFileName } from './IncrementalDiff.paths.js'

export { IncrementalReportSchema } from './IncrementalReport.schema.js'

export { StageError } from './Run.schema.js'
export { StrykerError } from './stryker-error.schema.js'
export { ChildProcessCrashedError, OutOfMemoryError } from './Worker.schema.js'

export { strykerVersion } from './stryker-package.js'

export type { EnginePorts } from './Run.js'
export { connectRetry, WorkerEntries, WorkerLauncher } from './WorkerLauncher.js'
export type { SpawnedSocketWorker, WorkerEntriesShape, WorkerLauncherShape } from './WorkerLauncher.js'
