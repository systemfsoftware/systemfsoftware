/**
 * The failure identities a caller of this package can meet.
 *
 * A consumer that runs a mutation test has to match on what came back, and
 * matching needs the class, not a description of it. Every identity here
 * appears in the error channel of an exported function: the three config-read
 * failures come out of `readConfig` and out of a run whose configuration is
 * unusable, and the three run failures are the error channel of
 * `runMutationTest` with `defaultStages`.
 *
 * Deliberately not everything that is a `TaggedError` in this package. The
 * checker handshake violations, the worker socket and protocol failures and
 * the sandbox spawn failures are interior wiring: they are folded into a
 * `StageError` before a run's failure channel is reached, so exporting them
 * would publish a shape no caller can observe and freeze it against a
 * refactor (REPO-A3).
 *
 * Re-exports only — importing this module runs no code, opens no handle and
 * writes to no descriptor.
 */
export {
  ConfigError,
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
} from './config/config-reader.schema.js'
export { StageError } from './run-stages/stage.schema.js'
export { StrykerError } from './stryker-error.schema.js'
export { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool/worker-pool.schema.js'
