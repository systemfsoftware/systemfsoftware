import * as Context from 'effect/Context'

/**
 * The absolute path of the sandboxed project copy under test.
 *
 * Provided only in sandbox workers (test runners, checkers); the engine
 * supplies it as per-process impure input rather than letting plugins infer
 * it from `process.cwd()`, which couples them to ambient state and makes the
 * input invisible to the type system.
 */
export class SandboxDirectory extends Context.Service<SandboxDirectory, string>()(
  '@systemfsoftware/stryker-js-plugin-api/plugin/SandboxDirectory',
) {}
