/**
 * The worker-facing wiring of the engine: the RPC protocol groups, the
 * plugin-loading primitives, the coverage schema, and the worker-options
 * wire codec a worker composition root binds.
 *
 * This entry exists for the process package that owns the worker entry
 * files (the CLI). It is public because those composition roots import it
 * from outside the engine package; everything not on it stays internal.
 */
export { create, loadPlugins } from './Plugins.js'
export { MutantCoverageSchema } from './TestRunner.schema.js'
export { decodeWorkerOptions, encodeWorkerOptions } from './worker-options.js'
export { CheckerRpcs, TestRunnerRpcs } from './WorkerProtocol.js'
