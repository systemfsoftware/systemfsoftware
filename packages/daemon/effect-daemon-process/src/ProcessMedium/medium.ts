/**
 * The `effect-daemon-spec` medium over operating-system child processes (R20, KTD17): a
 * child's program is a command spec, spawned through the `ChildProcessSpawner` its
 * composition root chose, and every signal it sends is the operating system's own — SIGTERM
 * for a graceful stop, and SIGKILL when the stop is brutal or its window elapses.
 *
 * @since 0.1.0
 */
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Deferred, Duration, Effect, Fiber, Layer, Match, Option, Schema, Scope, Stream } from 'effect'
import { absurd } from 'effect/Function'
import * as PlatformError from 'effect/PlatformError'
import * as Result from 'effect/Result'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { ClassifyProcessExit, classifyProcessExit } from './classify-process-exit.workflow.js'
import type { ProcessExit } from './ProcessExit.schema.js'
import { SelectKillSignals, selectKillSignals } from './select-kill-signals.workflow.js'

/** What a process medium can say and honour (R16): the exit status and signal it observed, and a group stop that leaves nothing running. */
export const declaration: Supervisor.Medium.MediumDeclaration = {
  reporting: 'exit',
  groupStop: 'atomic',
}

/** How a process medium reads a child's readiness (R10, KTD17). */
export interface ProcessMediumOptions {
  /**
   * The line the child writes to standard output when it is ready. Absent, a child counts
   * as ready as soon as it is spawned — the process analogue of readiness-on-start.
   */
  readonly readyLine?: string | undefined
}

/** The port a process child is declared against (KTD9): the command spec is the program. */
export const port = Supervisor.Medium.MediumPort<
  ChildProcess.Command,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>('ProcessMedium')

const ProcessStartedTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-process/ProcessMedium/Started',
)
type ProcessStartedTypeId = typeof ProcessStartedTypeId

interface ProcessStarted extends Supervisor.Medium.Started {
  readonly [ProcessStartedTypeId]: ProcessStartedTypeId
  readonly handle: ChildProcessSpawner.ChildProcessHandle
  readonly stopping: Deferred.Deferred<void>
}

const NORMAL: Supervisor.Medium.TerminationReason = { _tag: 'Normal' }

const SHUTDOWN: Supervisor.Medium.TerminationReason = { _tag: 'Shutdown' }

const abnormalExitOf = (code: number, signal: string): Supervisor.Medium.TerminationReason => ({
  _tag: 'Abnormal',
  report: { _tag: 'ExitReport', code, signal },
})

const terminationOf = (exit: ProcessExit): Supervisor.Medium.TerminationReason =>
  Match.value(
    Result.match(classifyProcessExit(new ClassifyProcessExit({ exit })), {
      onFailure: (error: never): never => absurd(error),
      onSuccess: (decision) => decision,
    }),
  ).pipe(
    Match.tag('ProcessExitNormal', (): Supervisor.Medium.TerminationReason => NORMAL),
    Match.tag(
      'ProcessExitAbnormal',
      (abnormal): Supervisor.Medium.TerminationReason => abnormalExitOf(abnormal.code, abnormal.signal),
    ),
    Match.exhaustive,
  )

const processStartedOf = (
  handle: ChildProcessSpawner.ChildProcessHandle,
  ready: Effect.Effect<void, Supervisor.Medium.ChildEndedBeforeReady>,
  stopping: Deferred.Deferred<void>,
): ProcessStarted => ({
  [Supervisor.Medium.StartedTypeId]: Supervisor.Medium.StartedTypeId,
  [ProcessStartedTypeId]: ProcessStartedTypeId,
  ready,
  handle,
  stopping,
})

const isProcessStarted = (evidence: Supervisor.Medium.Started): evidence is ProcessStarted =>
  ProcessStartedTypeId in evidence

const processOf = (evidence: Supervisor.Medium.Started): Option.Option<ProcessStarted> =>
  Option.liftPredicate(evidence, isProcessStarted)

/**
 * A signal name reaches the medium only through the failure `exitCode` raises, so the
 * platform's own words are the detail this observation carries.
 */
const platformDetailOf = (error: PlatformError.PlatformError): string =>
  Option.match(Schema.decodeUnknownOption(Schema.Struct({ message: Schema.String }))(error.reason.cause), {
    onNone: () => error.message,
    onSome: (cause) => cause.message,
  })

const observationOf = (handle: ChildProcessSpawner.ChildProcessHandle): Effect.Effect<ProcessExit> =>
  Effect.match(handle.exitCode, {
    onSuccess: (code): ProcessExit => ({ _tag: 'Exited', code }),
    onFailure: (error): ProcessExit => ({ _tag: 'Signaled', detail: platformDetailOf(error) }),
  })

const readyLineSeen = (
  handle: ChildProcessSpawner.ChildProcessHandle,
  readyLine: string,
  ready: Deferred.Deferred<void>,
): Effect.Effect<void> =>
  Effect.ignore(
    Stream.runForEach(
      Stream.splitLines(Stream.decodeText(handle.stdout)),
      (line) => (line === readyLine ? Deferred.succeed(ready, void 0) : Effect.void),
    ),
  )

const watchReady = (
  handle: ChildProcessSpawner.ChildProcessHandle,
  ready: Deferred.Deferred<void>,
  options: ProcessMediumOptions,
): Effect.Effect<void, never, Scope.Scope> =>
  Option.match(Option.fromNullishOr(options.readyLine), {
    onNone: () => Effect.asVoid(Deferred.succeed(ready, void 0)),
    onSome: (line) => Effect.asVoid(readyLineSeen(handle, line, ready)),
  })

const childEnded = (
  handle: ChildProcessSpawner.ChildProcessHandle,
  watching: Fiber.Fiber<void>,
): Effect.Effect<void> =>
  Effect.raceFirst(Effect.asVoid(Fiber.await(watching)), Effect.asVoid(Effect.exit(handle.exitCode)))

const killOptionsOf = (mode: Supervisor.Medium.ShutdownMode): ChildProcess.KillOptions =>
  Match.value(
    Result.match(selectKillSignals(new SelectKillSignals({ mode })), {
      onFailure: (error: never): never => absurd(error),
      onSuccess: (decision) => decision,
    }),
  ).pipe(
    Match.tag('BrutalKill', (): ChildProcess.KillOptions => ({ killSignal: 'SIGKILL' })),
    Match.tag('GracefulKill', (graceful): ChildProcess.KillOptions => ({
      killSignal: 'SIGTERM',
      forceKillAfter: Duration.millis(graceful.forceKillAfterMillis),
    })),
    Match.tag('PatientKill', (): ChildProcess.KillOptions => ({ killSignal: 'SIGTERM' })),
    Match.exhaustive,
  )

/**
 * Owned shutdown (R4, R15): the stop latch answers the report as a `Shutdown` before any
 * signal goes out — the ordering the fiber medium gives an interrupted fiber — and the
 * kill's own await is what makes the stop atomic, because the platform's `kill` returns
 * only once the process group has gone.
 */
const stopOf = (self: ProcessStarted, mode: Supervisor.Medium.ShutdownMode): Effect.Effect<void> =>
  Effect.andThen(
    Deferred.succeed(self.stopping, void 0),
    Effect.ignore(self.handle.kill(killOptionsOf(mode))),
  )

const spawnIn = (
  command: ChildProcess.Command,
  options: ProcessMediumOptions,
): Effect.Effect<
  ProcessStarted,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(command)
    const ready = yield* Deferred.make<void>()
    const stopping = yield* Deferred.make<void>()
    const watching = yield* Effect.forkScoped(watchReady(handle, ready, options))
    return processStartedOf(
      handle,
      Supervisor.Medium.readyOrChildEnded(ready, childEnded(handle, watching)),
      stopping,
    )
  })

const mediumOf = (
  options: ProcessMediumOptions,
): Supervisor.Medium.Medium<
  ChildProcess.Command,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> =>
  Supervisor.Medium.make({
    declaration,
    start: (command) => spawnIn(command, options),
    report: (evidence) =>
      Option.match(processOf(evidence), {
        onNone: () => Effect.succeed(SHUTDOWN),
        onSome: (self) =>
          Effect.raceFirst(
            Effect.as(Deferred.await(self.stopping), SHUTDOWN),
            Effect.map(observationOf(self.handle), terminationOf),
          ),
      }),
    probe: (evidence) =>
      Option.match(processOf(evidence), {
        onNone: () => Effect.succeed(false),
        // A liveness check the platform cannot answer is not evidence of death (KTD7).
        onSome: (self) => Effect.orElseSucceed(self.handle.isRunning, () => true),
      }),
    stop: (evidence, mode) =>
      Option.match(processOf(evidence), {
        onNone: () => Effect.succeed(Supervisor.Medium.stopped),
        onSome: (self) => Effect.as(stopOf(self, mode), Supervisor.Medium.stopped),
      }),
  })

/**
 * The port bound to a process medium (KTD9): the composition root provides it beside the
 * `ChildProcessSpawner` of the platform it chose, so this package depends on the port and
 * never on an implementation.
 */
export const layer = (
  options?: ProcessMediumOptions,
): Layer.Layer<
  Supervisor.Medium.MediumPortShape<
    ChildProcess.Command,
    PlatformError.PlatformError,
    Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
  >
> => Layer.succeed(port, { medium: mediumOf(options ?? {}) })
