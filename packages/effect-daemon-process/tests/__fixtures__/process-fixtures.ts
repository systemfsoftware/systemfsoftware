import { NodeChildProcessSpawner, NodeFileSystem, NodePath } from '@effect/platform-node-shared'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { ProcessMedium } from '@systemfsoftware/effect-daemon-process'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Effect, Layer, Match, Option, Ref, Schedule, Schema, Scope, Stream } from 'effect'
import type { ChildProcessSpawner } from 'effect/unstable/process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const fixturePath = fileURLToPath(new URL('./child-script.mjs', import.meta.url))

export const mediumLayer = ProcessMedium.layer({ readyLine: ProcessMedium.fixtureReadyLine })

export const referenceLayer = Conformance.FiberReferenceLayer

export const spawnerLayer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> = NodeChildProcessSpawner.layer.pipe(
  Layer.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)),
)

export const processDriver = ProcessMedium.conformanceDriver({ fixturePath })

let journals = 0

export const journalPath = (name: string): string =>
  join(tmpdir(), `effect-daemon-process-${name}-${process.pid}-${journals++}.log`)

const PID_PREFIX = 'PID '

const TERM_LINE = 'TERM'

const IGNORE_LINE = 'IGNORE'

const POLL_MILLIS = 50

const WAIT_MILLIS = '10 seconds'

const journalText = (journal: string): string => {
  try {
    return readFileSync(journal, 'utf8')
  } catch {
    return ''
  }
}

export const journalLinesOf = (journal: string): ReadonlyArray<string> =>
  Arr.filter(
    Arr.map(journalText(journal).split('\n'), (line) => line.trim()),
    (line) => line.length > 0,
  )

const awaitLineMatching = (
  journal: string,
  matches: (line: string) => boolean,
): Effect.Effect<Option.Option<string>> =>
  Effect.repeat(
    Effect.sync(() => Arr.findFirst(journalLinesOf(journal), matches)),
    { schedule: Schedule.spaced(POLL_MILLIS), until: Option.isSome },
  ).pipe(
    Effect.timeoutOrElse({ duration: WAIT_MILLIS, orElse: () => Effect.succeed(Option.none<string>()) }),
  )

export const awaitPidInJournal = (journal: string): Effect.Effect<number> =>
  Effect.map(
    awaitLineMatching(journal, (line) => line.startsWith(PID_PREFIX)),
    (line) => Number(Option.getOrElse(Option.map(line, (found) => found.slice(PID_PREFIX.length)), () => '0')),
  )

export const pidInJournal = (journal: string): number =>
  Number(
    Option.getOrElse(
      Option.map(
        Arr.findFirst(journalLinesOf(journal), (line) => line.startsWith(PID_PREFIX)),
        (found) => found.slice(PID_PREFIX.length),
      ),
      () => '0',
    ),
  )

export const awaitGracefulSignal = (journal: string): Effect.Effect<boolean> =>
  Effect.map(awaitLineMatching(journal, (line) => line === TERM_LINE), Option.isSome)

export const awaitStopIgnored = (journal: string): Effect.Effect<boolean> =>
  Effect.map(awaitLineMatching(journal, (line) => line === IGNORE_LINE), Option.isSome)

export const gracefulSignalSeen = (journal: string): boolean => Arr.contains(journalLinesOf(journal), TERM_LINE)

export const signalLinesOf = (journal: string): ReadonlyArray<string> =>
  Arr.filter(journalLinesOf(journal), (line) => !line.startsWith(PID_PREFIX))

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export const awaitProcessGone = (pid: number): Effect.Effect<boolean> =>
  Effect.repeat(Effect.sync(() => isAlive(pid)), {
    schedule: Schedule.spaced(POLL_MILLIS),
    until: (alive) => !alive,
  }).pipe(
    Effect.map((alive) => !alive),
    Effect.timeoutOrElse({ duration: WAIT_MILLIS, orElse: () => Effect.succeed(false) }),
  )

export const killProcess = (pid: number): Effect.Effect<void> => Effect.sync(() => process.kill(pid, 'SIGKILL'))

export const collectTraceOf = (
  handle: Supervisor.RunningSupervisor,
): Effect.Effect<Ref.Ref<ReadonlyArray<Supervisor.TraceEntry>>, never, Scope.Scope> =>
  Effect.gen(function*() {
    const seen = yield* Ref.make<ReadonlyArray<Supervisor.TraceEntry>>([])
    yield* Effect.forkScoped(
      Stream.runForEach(
        Supervisor.traceOf(handle),
        (entry) => Ref.update(seen, (entries) => Arr.append(entries, entry)),
      ),
      { startImmediately: true },
    )
    return seen
  })

export const startedChildIdsIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): ReadonlyArray<string> =>
  Arr.flatMap(entries, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildStarted', (started) => [started.childId]),
      Match.orElse((): ReadonlyArray<string> => []),
    ))

export const terminatedReasonsIn = (
  entries: ReadonlyArray<Supervisor.TraceEntry>,
): ReadonlyArray<Supervisor.Medium.TerminationReason> =>
  Arr.flatMap(entries, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildTerminated', (terminated) => [terminated.reason]),
      Match.orElse((): ReadonlyArray<Supervisor.Medium.TerminationReason> => []),
    ))

export const readyChildIdsIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): ReadonlyArray<string> =>
  Arr.flatMap(entries, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildReady', (ready) => [ready.childId]),
      Match.orElse((): ReadonlyArray<string> => []),
    ))

export const startDeadlineChildIdsIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): ReadonlyArray<string> =>
  Arr.flatMap(entries, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('TimerElapsed', (timer) =>
        timer.kind === 'start_deadline'
          ? Match.value(timer.target).pipe(
            Match.tag('ChildTimer', (child) => [child.childId]),
            Match.orElse((): ReadonlyArray<string> => []),
          )
          : []),
      Match.orElse((): ReadonlyArray<string> => []),
    ))

const reportOf = (reason: Supervisor.Medium.TerminationReason): Option.Option<Supervisor.Medium.FailureReport> =>
  Match.value(reason).pipe(
    Match.tag('Abnormal', (abnormal) => Option.some(abnormal.report)),
    Match.orElse(() => Option.none()),
  )

export const exitReportsIn = (
  entries: ReadonlyArray<Supervisor.TraceEntry>,
): ReadonlyArray<Supervisor.Medium.ExitReport> =>
  Arr.flatMap(terminatedReasonsIn(entries), (reason) =>
    Option.match(reportOf(reason), {
      onNone: () => [],
      onSome: (report) => (Schema.is(Supervisor.Medium.ExitReport)(report) ? [report] : []),
    }))

export const deadlineMissesIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): number =>
  Arr.length(
    Arr.filter(terminatedReasonsIn(entries), (reason) =>
      Option.exists(reportOf(reason), Schema.is(Supervisor.Medium.DeadlineMissedReport))),
  )

export const causesClaimedIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): number =>
  Arr.length(
    Arr.filter(terminatedReasonsIn(entries), (reason) =>
      Option.exists(reportOf(reason), Schema.is(Supervisor.Medium.CauseReport))),
  )

export const abnormalTerminationsIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): number =>
  Arr.length(Arr.filter(terminatedReasonsIn(entries), Schema.is(Supervisor.Medium.AbnormalTermination)))
