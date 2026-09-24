import type { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Duration, Effect, Match, Option, Ref, Schedule, Stream } from 'effect'
import type { Scope } from 'effect'
import * as Net from 'node:net'

const LOOPBACK_HOST = '127.0.0.1'
const CHILD_ID = 'worker'
const SETTLE_MILLIS = 5

export const closedLoopbackAddress: Effect.Effect<SocketMedium.SocketAddress> = Effect.callback((resume) => {
  const server = Net.createServer()
  server.listen(0, LOOPBACK_HOST, () => {
    const address = server.address()
    const bound = typeof address === 'object' && address !== null ? address.port : 0
    server.close(() => {
      resume(Effect.succeed({ host: LOOPBACK_HOST, port: bound }))
    })
  })
})

export interface SocketSession {
  readonly advance: (step: Conformance.ChildStep) => Effect.Effect<void>
  readonly awaitReady: Effect.Effect<void>
  readonly awaitTermination: Effect.Effect<void>
  readonly awaitFrames: (count: number) => Effect.Effect<void>
  readonly shutdown: Effect.Effect<void>
}

export const terminationTagsOf = (
  reasons: ReadonlyArray<Supervisor.Medium.TerminationReason>,
): ReadonlyArray<string> =>
  reasons.map((reason) =>
    Match.value(reason).pipe(
      Match.tag('Normal', () => 'Normal'),
      Match.tag('Shutdown', () => 'Shutdown'),
      Match.tag('Abnormal', () => 'Abnormal'),
      Match.exhaustive,
    )
  )

export const exitSignalsOf = (
  reasons: ReadonlyArray<Supervisor.Medium.TerminationReason>,
): ReadonlyArray<string> =>
  reasons.flatMap((reason) =>
    Match.value(reason).pipe(
      Match.tag('Abnormal', (abnormal) =>
        Match.value(abnormal.report).pipe(
          Match.tag('ExitReport', (report) => [report.signal]),
          Match.tag('DeadlineMissed', () => ['DeadlineMissed']),
          Match.tag('CauseReport', () => ['CauseReport']),
          Match.tag('InferredReport', () => ['InferredReport']),
          Match.exhaustive,
        )),
      Match.orElse(() => []),
    )
  )

export const exitCodesOf = (
  reasons: ReadonlyArray<Supervisor.Medium.TerminationReason>,
): ReadonlyArray<number> =>
  reasons.flatMap((reason) =>
    Match.value(reason).pipe(
      Match.tag('Abnormal', (abnormal) =>
        Match.value(abnormal.report).pipe(
          Match.tag('ExitReport', (report) => [report.code]),
          Match.orElse(() => []),
        )),
      Match.orElse(() => []),
    )
  )

export interface SocketObservation {
  readonly reasons: ReadonlyArray<Supervisor.Medium.TerminationReason>
  readonly ready: number
  readonly openConnections: number
  readonly receivedFrames: ReadonlyArray<string>
}

const eventOf = (entry: Supervisor.TraceEntry): Supervisor.TraceEntry['event'] => entry.event

const readyIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): boolean =>
  entries.some((entry) =>
    Match.value(eventOf(entry)).pipe(
      Match.tag('ChildReady', () => true),
      Match.orElse(() => false),
    )
  )

const terminatedIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): boolean =>
  entries.some((entry) =>
    Match.value(eventOf(entry)).pipe(
      Match.tag('ChildTerminated', () => true),
      Match.orElse(() => false),
    )
  )

const reasonOf = (entry: Supervisor.TraceEntry): ReadonlyArray<Supervisor.Medium.TerminationReason> =>
  Match.value(eventOf(entry)).pipe(
    Match.tag('ChildTerminated', (terminated) => [terminated.reason]),
    Match.orElse(() => []),
  )

const reasonsIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): ReadonlyArray<Supervisor.Medium.TerminationReason> =>
  entries.flatMap(reasonOf)

const readyCountIn = (entries: ReadonlyArray<Supervisor.TraceEntry>): number =>
  entries.filter((entry) =>
    Match.value(eventOf(entry)).pipe(
      Match.tag('ChildReady', () => true),
      Match.orElse(() => false),
    )
  ).length

const awaitWhere = (
  seen: Ref.Ref<ReadonlyArray<Supervisor.TraceEntry>>,
  holds: (entries: ReadonlyArray<Supervisor.TraceEntry>) => boolean,
): Effect.Effect<void> =>
  Effect.asVoid(
    Effect.repeat(Ref.get(seen), {
      schedule: Schedule.spaced(`${SETTLE_MILLIS} millis`),
      until: holds,
    }),
  )

const stepEffectOf = (session: SocketSession) => (step: Conformance.ChildStep): Effect.Effect<void> =>
  Match.value(step).pipe(
    Match.tag('BecomeReady', () => Effect.andThen(session.advance(step), session.awaitReady)),
    Match.tag('ExitNormal', () => Effect.andThen(session.advance(step), session.awaitTermination)),
    Match.tag('ExitAbnormal', () => Effect.andThen(session.advance(step), session.awaitTermination)),
    Match.orElse(() => session.advance(step)),
  )

export const driveScript =
  (steps: ReadonlyArray<Conformance.ChildStep>) => (session: SocketSession): Effect.Effect<void> =>
    Effect.andThen(
      Effect.forEach(steps, (step) => stepEffectOf(session)(step), { discard: true }),
      session.shutdown,
    )

export const awaitTerminationThenShutdown = (session: SocketSession): Effect.Effect<void> =>
  Effect.andThen(session.awaitTermination, session.shutdown)

export const observeSocketChild = (parts: {
  readonly child?: Supervisor.ChildOptions
  readonly program: (fixture: SocketMedium.LoopbackServer) => SocketMedium.SocketProgram
  readonly drive: (session: SocketSession) => Effect.Effect<void>
}): Effect.Effect<
  SocketObservation,
  never,
  Supervisor.Medium.MediumPortShape<SocketMedium.SocketProgram, never, Scope.Scope>
> =>
  Effect.scoped(Effect.gen(function*() {
    const fixture = yield* Effect.orDie(SocketMedium.makeLoopbackServer)
    const handle = yield* Supervisor.make('socket-contract').pipe(
      Supervisor.children([
        Supervisor.ChildSpecs.on(SocketMedium.port)(CHILD_ID, parts.program(fixture), parts.child),
      ]),
    ).scoped
    const seen = yield* Ref.make<ReadonlyArray<Supervisor.TraceEntry>>([])
    yield* Effect.forkScoped(
      Stream.runForEach(Supervisor.traceOf(handle), (entry) => Ref.update(seen, (entries) => [...entries, entry])),
    )
    yield* parts.drive({
      advance: (step) => fixture.advance(step, 0),
      awaitReady: awaitWhere(seen, readyIn),
      awaitTermination: awaitWhere(seen, terminatedIn),
      awaitFrames: (count) =>
        Effect.asVoid(
          Effect.repeat(fixture.receivedFrames, {
            schedule: Schedule.spaced(`${SETTLE_MILLIS} millis`),
            until: (frames) => frames.length >= count,
          }),
        ),
      shutdown: Supervisor.shutdown(handle).pipe(Effect.catchTag('SupervisorTerminated', () => Effect.void)),
    })
    const quieted = yield* Effect.timeoutOption(
      Effect.repeat(fixture.openConnections, {
        schedule: Schedule.spaced(`${SETTLE_MILLIS} millis`),
        until: (open) => open === 0,
      }),
      Duration.seconds(2),
    )
    const entries = yield* Ref.get(seen)
    const open = yield* fixture.openConnections
    return {
      reasons: reasonsIn(entries),
      ready: readyCountIn(entries),
      openConnections: Option.getOrElse(quieted, () => open),
      receivedFrames: yield* fixture.receivedFrames,
    }
  }))
