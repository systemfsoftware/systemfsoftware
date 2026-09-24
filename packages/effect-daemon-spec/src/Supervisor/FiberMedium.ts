import { Cause, Deferred, Duration, Effect, Exit, Fiber, Match, Option, Scope } from 'effect'
import type { ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import { make, type Medium as MediumShape, type Started, StartedTypeId, type Stopped, stopped } from './Medium.js'

export type BareFiberProgram = Effect.Effect<void, never, Scope.Scope>

export type FiberProgram = (ready: Effect.Effect<void>) => BareFiberProgram

export const readyOnStart = (program: BareFiberProgram): FiberProgram => (ready) => Effect.andThen(ready, program)

const FiberStartedTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-spec/FiberMedium/Started',
)
type FiberStartedTypeId = typeof FiberStartedTypeId
interface FiberStarted extends Started {
  readonly [FiberStartedTypeId]: FiberStartedTypeId
  readonly fiber: Fiber.Fiber<void, never>
  readonly scope: Scope.Scope
}

const fiberStarted = (
  fiber: Fiber.Fiber<void, never>,
  scope: Scope.Scope,
  ready: Effect.Effect<void>,
): FiberStarted => ({
  [StartedTypeId]: StartedTypeId,
  [FiberStartedTypeId]: FiberStartedTypeId,
  fiber,
  ready,
  scope,
})

const isFiberStarted = (evidence: Started): evidence is FiberStarted => FiberStartedTypeId in evidence

const fiberOf = (evidence: Started): Option.Option<FiberStarted> => Option.filter(Option.some(evidence), isFiberStarted)

const normalTermination: TerminationReason = { _tag: 'Normal' }

const shutdownTermination: TerminationReason = { _tag: 'Shutdown' }

const abnormalOf = (cause: Cause.Cause<never>): TerminationReason => ({
  _tag: 'Abnormal',
  report: { _tag: 'CauseReport', cause: Cause.pretty(cause) },
})

const terminationOf = (exit: Exit.Exit<void, never>): TerminationReason =>
  Exit.match(exit, {
    onSuccess: () => normalTermination,
    onFailure: (cause) => (Cause.hasInterruptsOnly(cause) ? shutdownTermination : abnormalOf(cause)),
  })

const closedChild = (self: FiberStarted): Effect.Effect<void> => Scope.close(self.scope, Exit.void)

const forcedChild = (self: FiberStarted): Effect.Effect<void> => Fiber.interrupt(self.fiber)

const stopOf = (self: FiberStarted, mode: ShutdownMode): Effect.Effect<void> =>
  Match.value(mode).pipe(
    Match.tag('Brutal', () => Effect.andThen(forcedChild(self), closedChild(self))),
    Match.tag('Graceful', (graceful) =>
      Effect.andThen(
        Effect.raceFirst(
          Fiber.await(self.fiber),
          Effect.andThen(Effect.sleep(Duration.millis(graceful.millis)), forcedChild(self)),
        ),
        closedChild(self),
      )),
    Match.tag('Infinity', () => Effect.andThen(Fiber.await(self.fiber), closedChild(self))),
    Match.exhaustive,
  )

export const medium: MediumShape<FiberProgram, never, Scope.Scope> = make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program) =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const signalled = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkIn(program(Deferred.succeed(signalled, void 0)), scope)
      return fiberStarted(fiber, scope, Deferred.await(signalled))
    }),
  report: (evidence) =>
    Option.match(fiberOf(evidence), {
      onNone: () => Effect.succeed(shutdownTermination),
      onSome: (self) => Effect.map(Fiber.await(self.fiber), terminationOf),
    }),
  probe: (evidence) =>
    Option.match(fiberOf(evidence), {
      onNone: () => Effect.succeed(false),
      onSome: (self) => Effect.sync(() => self.fiber.pollUnsafe() === undefined),
    }),
  stop: (evidence, mode): Effect.Effect<Stopped, never, Scope.Scope> =>
    Option.match(fiberOf(evidence), {
      onNone: () => Effect.succeed(stopped),
      onSome: (self) => Effect.map(stopOf(self, mode), () => stopped),
    }),
})
