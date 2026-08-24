import * as Context from 'effect/Context'

import type { ResolvedMode } from './output-mode.js'
import type { RunEventSink } from './run-event.js'

/**
 * What the host resolved once, before the run started, and the engine reads
 * without probing for it.
 *
 * One service, not one per member. The container held these as ten separate
 * string tokens — `runEventSink`, `runId`, `resolvedMode`, `progressEnabled`,
 * `clearTextEnabled`, `runStartedAt`, `reporterPluginModules`,
 * `reporterOverride`, `loggerConsoleOut`, `loggerShowColors` — which forced
 * every consumer to name each member it wanted and every test to provide ten
 * bindings to exercise one. They are a single capability: *what this run's
 * host already decided*. A consumer that needs only `runId` still depends on
 * the environment, because `{ runId, … }` is assignable to `{ runId }` and the
 * narrower projection would be a second name for the same thing (`REPO-A3`).
 *
 * Every member is data. Nothing here performs I/O, so the engine cannot reach
 * the terminal, the clock or the process through it — those are separate
 * capabilities with their own ports.
 */
export interface RunEnvironmentShape {
  /** Where the run's events go. The host decides whether an event renders. */
  readonly runEventSink: RunEventSink

  /** Shared by the stream header and the verdict envelope. */
  readonly runId: string

  /** Resolved once at the edge, with the signal that decided it. */
  readonly resolvedMode: ResolvedMode

  readonly progressEnabled: boolean
  readonly clearTextEnabled: boolean

  /**
   * The run's clock zero. Every `elapsedMs` measures from here, so a stage
   * reports elapsed time without reading the clock itself.
   */
  readonly runStartedAt: number

  /** Absolute path of the directory the run was launched from, resolved once at the edge. */
  readonly basePath: string

  /** The module specifiers whose `strykerPlugins` this run loads. */
  readonly reporterPluginModules: readonly string[]
}

/**
 * The environment port. Provided by the host at the composition root; never
 * constructed inside the engine, so it declares no `make`.
 */
export class RunEnvironment extends Context.Service<RunEnvironment, RunEnvironmentShape>()(
  '@systemfsoftware/stryker-js-mutation-run/RunEnvironment',
) {}
