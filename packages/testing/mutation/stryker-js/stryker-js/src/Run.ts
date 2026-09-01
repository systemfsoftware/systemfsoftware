import { Cell } from '@systemfsoftware/effect-cell-types'
import type * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  Heartbeat,
  HelpRendered,
  ManifestRendered,
  MutantTested,
  PhaseEntered,
  PlanKnown,
  RunCommand,
  RunEvent,
  RunFailed,
  RunOutput,
  RunStarted,
  VerdictReached,
} from './Run.schema.js'
import { MutationRunPlan, planMutationRun, PlanMutationRunCommand, PlanMutationRunError } from './Run.workflow.js'

/**
 * Where a run's events go.
 *
 * The error channel carries `Cause.Done`, the graceful completion signal: a finished run
 * ends the queue, and `Stream.fromQueue` excludes `Done` from its own error channel, so the
 * consumer sees end-of-stream. Interrupting the queue instead would end it with an
 * interrupt cause, and joining the drain would then re-raise that into the caller and lose
 * the exit code the run had already decided.
 */
export class RunEvents extends Context.Service<RunEvents, Queue.Queue<RunEvent, Cause.Done>>()(
  '~@systemfsoftware/stryker-js/RunEvents',
) {}

export interface RunIdentityShape {
  readonly runId: string
  readonly basePath: string
}

export class RunIdentity extends Context.Service<RunIdentity, RunIdentityShape>()(
  '~@systemfsoftware/stryker-js/RunIdentity',
) {}

export interface MutationRunIo {
  readonly read: (command: RunCommand) => Effect.Effect<unknown, S.SchemaError, RunIdentity>
  readonly write: (output: RunOutput) => Effect.Effect<void, S.SchemaError, RunIdentity>
}

export const mutationRunDescription = (io: MutationRunIo): Cell.Cell<RunCommand, void, S.SchemaError, RunIdentity> =>
  Cell.layer({
    read: (command) => io.read(command),
    decode: (raw: unknown) => S.decodeUnknownResult(PlanMutationRunCommand)(raw),
    decide: planMutationRun,
    encode: (outcome: Result.Result<MutationRunPlan, PlanMutationRunError>) =>
      Result.match(outcome, {
        onFailure: (error) =>
          new RunOutput({
            verdictJson: JSON.stringify({ error: error.message }),
            exitCode: 1,
          }),
        onSuccess: (plan) =>
          new RunOutput({
            verdictJson: JSON.stringify({ mutate: plan.mutatePatterns, mutatorNames: plan.mutatorNames }),
            exitCode: 0,
          }),
      }),
    write: (output: RunOutput, _raw: unknown) => io.write(output),
  })

export const runMutationTest = (
  io: MutationRunIo,
  command: RunCommand,
): Effect.Effect<void, S.SchemaError, RunIdentity> => Cell.run(mutationRunDescription(io), command)

export const shouldKeepTempDir = (
  exit: Exit.Exit<void, PlanMutationRunError | S.SchemaError>,
  cleanTempDir: 'always' | boolean,
): boolean => Exit.isFailure(exit) && cleanTempDir !== 'always'

export {
  Heartbeat,
  HelpRendered,
  ManifestRendered,
  MutantTested,
  PhaseEntered,
  PlanKnown,
  RunEvent,
  RunFailed,
  RunStarted,
  VerdictReached,
}
export type { RunEvent as RunEventType }
export { ModeSignal, MutantStatus, OutputMode, RunPhase } from './Run.schema.js'
export type { Location, Position, RunTerminalEvent } from './Run.schema.js'
