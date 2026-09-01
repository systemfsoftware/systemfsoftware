/**
 * The worker-facing wiring of the engine: the RPC protocol groups and the
 * plugin-loading primitives a worker composition root binds.
 *
 * This entry exists for the process package that owns the worker entry
 * files (the CLI). It is public because those composition roots import it
 * from outside the engine package; everything not on it stays internal.
 */
export { create, loadPlugins } from './Plugins.js'
export { CheckerRpcs, TestRunnerRpcs } from './WorkerProtocol.js'
