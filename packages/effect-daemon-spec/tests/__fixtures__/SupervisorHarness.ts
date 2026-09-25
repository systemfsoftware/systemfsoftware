import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Duration, Effect, Fiber, Match, Option, Queue, Scope, Stream } from 'effect'
import { dual } from 'effect/Function'
import { TestClock } from 'effect/testing'

type TraceEntry = Supervisor.TraceEntry

/** A child that is ready at once and runs until it is stopped. */
export const neverChild: Supervisor.FiberProgram = Supervisor.readyOnStart(Effect.never)

/**
 * A child whose every incarnation is ready at once and crashes when it takes one
 * signal from `crashes`, so a test can crash exactly one incarnation at a time.
 */
export const crashingChild = (crashes: Queue.Queue<void>): Supervisor.FiberProgram =>
  Supervisor.readyOnStart(Effect.andThen(Queue.take(crashes), Effect.die('crashed')))

const noCommands = { stops: [], starts: [], arms: [], replies: [], terminates: [] } as const

const commandsOf = (decision: TraceEntry['decision']) =>
  Match.value(decision).pipe(
    Match.tag('Stale', () => noCommands),
    Match.orElse((decided) => decided.commands),
  )

/** The children the traced decisions stopped, in the order the supervisor stopped them. */
export const stoppedIn = (trace: ReadonlyArray<TraceEntry>): ReadonlyArray<string> =>
  Arr.flatMap(trace, (entry) => Arr.map(commandsOf(entry.decision).stops, (stop) => stop.childId))

/** The children the traced decisions started, in the order the supervisor started them. */
export const startedIn = (trace: ReadonlyArray<TraceEntry>): ReadonlyArray<string> =>
  Arr.flatMap(trace, (entry) => Arr.map(commandsOf(entry.decision).starts, (start) => start.childId))

/** Whether the traced decisions terminated the supervisor itself. */
export const terminatedIn = (trace: ReadonlyArray<TraceEntry>): boolean =>
  Arr.some(trace, (entry) => commandsOf(entry.decision).terminates.length > 0)

/** The trace from the first report that `childId` terminated onward. */
export const sinceTerminationOf = (childId: string) => (trace: ReadonlyArray<TraceEntry>): ReadonlyArray<TraceEntry> =>
  Arr.dropWhile(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildTerminated', (terminated) => terminated.childId !== childId),
      Match.orElse(() => true),
    ))

/**
 * Collects the supervisor's trace from now until `done` holds for everything seen
 * so far. The subscription is taken before this returns, so no later step is missed.
 */
export const traceUntil: {
  (
    done: (trace: ReadonlyArray<TraceEntry>) => boolean,
  ): (
    supervisor: Supervisor.RunningSupervisor,
  ) => Effect.Effect<Fiber.Fiber<ReadonlyArray<TraceEntry>>, never, Scope.Scope>
  (
    supervisor: Supervisor.RunningSupervisor,
    done: (trace: ReadonlyArray<TraceEntry>) => boolean,
  ): Effect.Effect<Fiber.Fiber<ReadonlyArray<TraceEntry>>, never, Scope.Scope>
} = dual(
  2,
  (
    supervisor: Supervisor.RunningSupervisor,
    done: (trace: ReadonlyArray<TraceEntry>) => boolean,
  ): Effect.Effect<Fiber.Fiber<ReadonlyArray<TraceEntry>>, never, Scope.Scope> =>
    Effect.forkScoped(
      Supervisor.traceOf(supervisor).pipe(
        Stream.scan(() => Arr.empty<TraceEntry>(), (seen: ReadonlyArray<TraceEntry>, entry) => Arr.append(seen, entry)),
        Stream.takeUntil(done),
        Stream.runLast,
        Effect.map(Option.getOrElse(() => Arr.empty<TraceEntry>())),
      ),
      { startImmediately: true },
    ),
)
/**
 * Joins `fiber` while the test clock moves forward in small steps, so start
 * deadlines, backoff and shutdown windows elapse as the supervisor needs them to.
 */
export const settled = <A>(fiber: Fiber.Fiber<A>): Effect.Effect<A> =>
  Effect.raceFirst(Fiber.join(fiber), Effect.forever(TestClock.adjust(Duration.millis(10))))
