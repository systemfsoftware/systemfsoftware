import { type ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run'
import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as CliError from 'effect/unstable/cli/CliError'

import { CliRequest } from './cli-request.schema.js'
import type { OutputModeProbe } from './output-mode-probe.js'
import type { RunEventStreamPort } from './run-event-stream.js'
import type { SignalObserver } from './signal-observer.js'

/**
 * The mutation-testing entry the CLI calls once options are parsed. Injectable
 * so tests capture the parsed options without starting a real mutation run.
 */
export type StrykerRun = (options: PartialStrykerOptions) => Effect.Effect<unknown, unknown, never>

/**
 * The mode probe the CLI resolves its mode with (U3): a single detection of
 * the environment, shared by the reporters. Borrowed from the port service
 * type so the handler never hand-writes a signature the port could drift from.
 */
export type DetectModeCapability = OutputModeProbe['detectMode']

/**
 * The run-event-stream factory a run executes with: opens a run's NDJSON
 * stream from the resolved mode. Borrowed from the port service type so the
 * executor never hand-writes a signature the port could drift from.
 */
export type CreateRunEventStreamCapability = RunEventStreamPort['createRunEventStream']

/**
 * The frame the handler hands the executor: the already-run `@effect/cli`
 * program, the parsed request, the resolved mode, the optional run — and the
 * raw argument tokens, which the error envelope names the offending argument
 * from when the framework reports one it does not know.
 */
export interface RunStrykerCliInput {
  readonly program: Effect.Effect<void, CliError.CliError, never>
  readonly requestRef: Ref.Ref<Option.Option<CliRequest>>
  readonly mode: ResolvedMode
  readonly runMutationTest: StrykerRun | undefined
  readonly argv: readonly string[]
  /** The terminating signal, observed at the process edge (`signal-observer.ts`). */
  readonly lastSignal: SignalObserver
}
