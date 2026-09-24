import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { ProcessMedium } from '@systemfsoftware/effect-daemon-process'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Effect, Fiber, Ref, Scope } from 'effect'
import type * as PlatformError from 'effect/PlatformError'
import { ChildProcess } from 'effect/unstable/process'
import type { ChildProcessSpawner } from 'effect/unstable/process'
import {
  awaitGracefulSignal,
  awaitPidInJournal,
  awaitProcessGone,
  awaitStopIgnored,
  collectTraceOf,
  fixturePath,
  isAlive,
  journalPath,
  killProcess,
  pidInJournal,
  processDriver,
  signalLinesOf,
} from './process-fixtures.js'

export type ProcessProject =
  | Supervisor.Medium.MediumPortShape<
    ChildProcess.Command,
    PlatformError.PlatformError,
    Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
  >
  | ChildProcessSpawner.ChildProcessSpawner

type MediumShape = Supervisor.Medium.Medium<
  ChildProcess.Command,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>

interface ChildRequest {
  readonly name: string
  readonly childId: string
  readonly program: ChildProcess.Command
  readonly options?: Supervisor.ChildOptions | undefined
}

const journalDriver = (journal: string) => ProcessMedium.conformanceDriver({ fixturePath, fixtureArgs: [journal] })

const declared = (request: ChildRequest): Supervisor.SupervisorSpec<ProcessProject> =>
  Supervisor.make(request.name).pipe(
    Supervisor.intensity(0, 60_000),
    Supervisor.children([
      Supervisor.ChildSpecs.on(ProcessMedium.port)(request.childId, request.program, request.options),
    ]),
  )

export interface ScriptedRequest {
  readonly name: string
  readonly childId: string
  readonly steps: ReadonlyArray<Conformance.ChildStep>
  readonly options?: Supervisor.ChildOptions | undefined
}

export const scriptedRun = (
  request: ScriptedRequest,
): Effect.Effect<ReadonlyArray<Supervisor.TraceEntry>, never, ProcessProject | Scope.Scope> =>
  Effect.scoped(
    Effect.gen(function*() {
      const launched = yield* processDriver.launch(request.childId, request.steps)
      const handle = yield* declared({ ...request, program: launched.program }).scoped
      const trace = yield* collectTraceOf(handle)
      yield* Effect.forEach(request.steps, (step) => launched.control.advance(step, 0), { discard: true })
      yield* Supervisor.awaitTerminated(handle)
      return yield* Ref.get(trace)
    }),
  )

export const programRun = (
  request: ChildRequest,
): Effect.Effect<ReadonlyArray<Supervisor.TraceEntry>, never, ProcessProject | Scope.Scope> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* declared(request).scoped
      const trace = yield* collectTraceOf(handle)
      yield* Supervisor.awaitTerminated(handle)
      return yield* Ref.get(trace)
    }),
  )

export interface OwnedChild {
  readonly scope: Scope.Scope
  readonly pid: number
  readonly wasRunning: boolean
}

export const ownedChild = (
  request: { readonly name: string; readonly childId: string },
): Effect.Effect<OwnedChild, never, ProcessProject | Scope.Scope> =>
  Effect.gen(function*() {
    const journal = journalPath(request.name)
    const launched = yield* journalDriver(journal).launch(request.childId, [])
    const scope = yield* Scope.make()
    yield* Effect.provideService(declared({ ...request, program: launched.program }).scoped, Scope.Scope, scope)
    const pid = yield* awaitPidInJournal(journal)
    return { scope, pid, wasRunning: isAlive(pid) }
  })

export interface StopObservation {
  readonly stopIgnored: boolean
  readonly signals: ReadonlyArray<string>
  readonly goneAfterStop: boolean
}

export interface RelentlessObservation {
  readonly gracefulSignalSeen: boolean
  readonly stillWaiting: boolean
  readonly stillRunning: boolean
}

interface IgnoringChild {
  readonly medium: MediumShape
  readonly evidence: Supervisor.Medium.Started
  readonly journal: string
  readonly stopIgnored: boolean
}

const sigtermIgnoringChild = (
  name: string,
): Effect.Effect<IgnoringChild, PlatformError.PlatformError, ProcessProject | Scope.Scope> =>
  Effect.gen(function*() {
    const journal = journalPath(name)
    const launched = yield* journalDriver(journal).launch('worker', [])
    const { medium } = yield* ProcessMedium.port
    const evidence = yield* medium.start(launched.program)
    yield* launched.control.advance({ _tag: 'IgnoreGracefulStop' }, 0)
    const stopIgnored = yield* awaitStopIgnored(journal)
    return { medium, evidence, journal, stopIgnored }
  })

const observeStop = (
  name: string,
  mode: Supervisor.Medium.ShutdownMode,
): Effect.Effect<StopObservation, PlatformError.PlatformError, ProcessProject | Scope.Scope> =>
  Effect.scoped(
    Effect.gen(function*() {
      const child = yield* sigtermIgnoringChild(name)
      const pid = pidInJournal(child.journal)
      yield* child.medium.stop(child.evidence, mode)
      return {
        stopIgnored: child.stopIgnored,
        signals: signalLinesOf(child.journal),
        goneAfterStop: yield* awaitProcessGone(pid),
      }
    }),
  )

export const brutalStop = (
  name: string,
): Effect.Effect<StopObservation, PlatformError.PlatformError, ProcessProject | Scope.Scope> =>
  observeStop(name, { _tag: 'Brutal' })

export const gracefulStop = (
  request: { readonly name: string; readonly millis: number },
): Effect.Effect<StopObservation, PlatformError.PlatformError, ProcessProject | Scope.Scope> =>
  observeStop(request.name, { _tag: 'Graceful', millis: request.millis })

export const infinityStop = (
  name: string,
): Effect.Effect<RelentlessObservation, PlatformError.PlatformError, ProcessProject | Scope.Scope> =>
  Effect.scoped(
    Effect.gen(function*() {
      const child = yield* sigtermIgnoringChild(name)
      const stop = yield* Effect.forkChild(child.medium.stop(child.evidence, { _tag: 'Infinity' }))
      const pid = yield* awaitPidInJournal(child.journal)
      const signalled = yield* awaitGracefulSignal(child.journal)
      const stillWaiting = stop.pollUnsafe() === undefined
      const stillRunning = isAlive(pid)
      yield* killProcess(pid)
      yield* Fiber.join(stop)
      return { gracefulSignalSeen: signalled, stillWaiting, stillRunning }
    }),
  )
