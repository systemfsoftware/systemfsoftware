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
  MutationRunPlan,
  PhaseEntered,
  PlanKnown,
  PlanMutationRunCommand,
  RunCommand,
  RunEvent,
  RunFailed,
  RunOutput,
  RunStarted,
  VerdictReached,
} from './Run.schema.js'

const selectFallback = <T>(preferred: ReadonlyArray<T>, fallback: ReadonlyArray<T>): ReadonlyArray<T> => {
  if (preferred.length > 0) {
    return [...preferred]
  }
  return [...fallback]
}
/**
 * Evicted plan decision: a total map with a dead error channel, so it
 * returns the plan directly instead of a `Result`.
 */
export const planMutationRun = (command: PlanMutationRunCommand): MutationRunPlan => {
  const mutatePatterns = selectFallback(command.targetMutatePatterns, command.configMutatePatterns)
  const mutatorNames = selectFallback(command.availableMutators, command.configMutatorNames)
  return MutationRunPlan.make({
    mutatePatterns,
    mutatorNames,
  })
}

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

export const mutationRunDescription = (io: MutationRunIo): Cell.Cell<RunCommand, void, S.SchemaError, RunIdentity> => ({
  [Cell.CellTypeId]: Cell.CellTypeId,
  run: (command) =>
    Effect.gen(function*() {
      const raw = yield* io.read(command)
      const decoded = yield* Result.match(S.decodeUnknownResult(PlanMutationRunCommand)(raw), {
        onFailure: Effect.fail,
        onSuccess: Effect.succeed,
      })
      const plan = planMutationRun(decoded)
      const output = new RunOutput({
        verdictJson: JSON.stringify({ mutate: plan.mutatePatterns, mutatorNames: plan.mutatorNames }),
        exitCode: 0,
      })
      return yield* io.write(output)
    }),
})

export const runMutationTest = (
  io: MutationRunIo,
  command: RunCommand,
): Effect.Effect<void, S.SchemaError, RunIdentity> => Cell.run(mutationRunDescription(io), command)

export const shouldKeepTempDir = (
  exit: Exit.Exit<void, S.SchemaError>,
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
