import { Context, Deferred, Effect } from 'effect'
import { dual } from 'effect/Function'
import type { ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import { ChildEndedBeforeReady } from './ChildEndedBeforeReady.schema.js'
export { BrutalShutdown, GracefulShutdown, InfinityShutdown, ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
export {
  AbnormalTermination,
  CauseReport,
  DeadlineMissedReport,
  ExitReport,
  FailureReport,
  InferredReport,
  NormalTermination,
  ShutdownTermination,
  TerminationReason,
} from '../kernel/TerminationReport.schema.js'
export { GroupStopGuarantee, MediumDeclaration, MediumReporting } from './MediumDeclaration.schema.js'
import type { MediumDeclaration } from './MediumDeclaration.schema.js'

export const StartedTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/Medium/Started')
export type StartedTypeId = typeof StartedTypeId

export const StoppedTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/Medium/Stopped')
export type StoppedTypeId = typeof StoppedTypeId

export { ChildEndedBeforeReady }

/**
 * The readiness the kernel watches: it succeeds when the child signals, and fails
 * with `ChildEndedBeforeReady` when the child's run is gone first, however it
 * ended, so a supervisor is never left waiting on a child that can no longer
 * signal. Guarding the failure on the signal still being pending keeps a child
 * that signalled and then ended in the same breath from being read as never ready.
 * The run's end is passed as a plain `void` effect, so a medium whose run ends as
 * a Deferred or an Exit normalises it to the same shape before calling here.
 */
export const readyOrChildEnded: {
  (
    signal: Deferred.Deferred<void>,
    runEnded: Effect.Effect<void>,
  ): Effect.Effect<void, ChildEndedBeforeReady>
  (
    runEnded: Effect.Effect<void>,
  ): (signal: Deferred.Deferred<void>) => Effect.Effect<void, ChildEndedBeforeReady>
} = dual(
  2,
  (signal: Deferred.Deferred<void>, runEnded: Effect.Effect<void>): Effect.Effect<void, ChildEndedBeforeReady> =>
    Effect.raceFirst(
      Deferred.await(signal),
      Effect.flatMap(
        runEnded,
        () =>
          Effect.flatMap(
            Deferred.isDone(signal),
            (alreadySignalled) => alreadySignalled ? Effect.void : Effect.fail(ChildEndedBeforeReady.make({})),
          ),
      ),
    ),
)

/**
 * Evidence that a medium started a child (KTD8): unforgeable, because only a
 * medium's `start` port can mint it. It carries the readiness signal the kernel
 * races against its start-deadline timer (R10); the termination report and the
 * single-shot liveness probe are the medium's `report` and `probe` ports run
 * over this evidence, so neither can observe a child that never started.
 *
 * The signal succeeds when the child says it is ready and fails with
 * `ChildEndedBeforeReady` when the child's run ends first, however it ended, so
 * a supervisor is never left waiting on a child that is already gone.
 */
export interface Started {
  readonly [StartedTypeId]: StartedTypeId
  readonly ready: Effect.Effect<void, ChildEndedBeforeReady>
}

/**
 * Evidence that a medium stopped a child (KTD8): returned only by `stop`, which
 * the builder wraps so owned shutdown cannot be interrupted part-way (R15).
 */
export interface Stopped {
  readonly [StoppedTypeId]: StoppedTypeId
}

/** Mint `Started` evidence for a child whose readiness completes `ready`. */
export const started = (ready: Effect.Effect<void, ChildEndedBeforeReady>): Started => ({
  [StartedTypeId]: StartedTypeId,
  ready,
})

/** The single `Stopped` evidence value every medium returns from `stop`. */
export const stopped: Stopped = { [StoppedTypeId]: StoppedTypeId }

/**
 * The child-protocol obligations a medium supplies in one options record
 * (R15, KTD8). `start` mints `Started` evidence, `report` resolves with the
 * child's `TerminationReason` when it terminates, `probe` answers one liveness
 * check (the kernel runs it once per tick, KTD7), and `stop` owns shutdown in
 * the declared R4 mode and must not be callable with anything but `Started`
 * evidence.
 */
export interface MediumOptions<Program, StartError = never, R = never> {
  readonly declaration: MediumDeclaration
  readonly start: (program: Program) => Effect.Effect<Started, StartError, R>
  readonly report: (evidence: Started) => Effect.Effect<TerminationReason, never, R>
  readonly probe: (evidence: Started) => Effect.Effect<boolean, never, R>
  readonly stop: (evidence: Started, mode: ShutdownMode) => Effect.Effect<Stopped, never, R>
}

/**
 * A medium: the child protocol over one program type (R15–R17). Child order and
 * identity come from the supervisor, never from the medium.
 */
export type Medium<Program, StartError = never, R = never> = MediumOptions<Program, StartError, R>

/**
 * KTD8: a medium exists only through `make`, whose options record requires every
 * obligation. `stop` is wrapped in an uninterruptible region, so owned shutdown
 * honouring R4's modes cannot be interrupted part-way (R15).
 */
export const make = <Program, StartError = never, R = never>(
  options: MediumOptions<Program, StartError, R>,
): Medium<Program, StartError, R> => ({
  ...options,
  stop: (evidence, mode) => Effect.uninterruptible(options.stop(evidence, mode)),
})

/**
 * The capability a driver provides for one program type (KTD9): the medium that
 * interprets the child's program. The driver binds it as `layer(options)` at the
 * composition root, so one tree can mix media while strategy, order and policy
 * never name a medium implementation (R17, R18).
 */
export interface MediumPortShape<Program, StartError = never, R = never> {
  readonly medium: Medium<Program, StartError, R>
}

/** Declare a medium port keyed to the program type it interprets (KTD9). */
export const MediumPort = <Program, StartError = never, R = never>(
  key: string,
): Context.Service<MediumPortShape<Program, StartError, R>, MediumPortShape<Program, StartError, R>> =>
  Context.Service<MediumPortShape<Program, StartError, R>>(key)
