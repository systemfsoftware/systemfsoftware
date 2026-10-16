import { Cause, Deferred, Duration, Effect, Exit, Fiber, Match, Option, Result, Scope } from 'effect'
import { absurd } from 'effect/Function'
import type { ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import type { ChildExitDecision } from './ChildExitDecision.schema.js'
import { terminationReasonOf } from './ChildExitDecision.schema.js'
import { ClassifyChildExit, classifyChildExit } from './classify-child-exit.workflow.js'
import {
  make,
  type Medium as MediumShape,
  MediumPort,
  type Started,
  StartedTypeId,
  type Stopped,
  stopped,
} from './Medium.js'
import type { SupervisorTerminated } from './SupervisorTerminated.schema.js'

export type BareFiberProgram = Effect.Effect<void, SupervisorTerminated, Scope.Scope>

export type FiberProgram = (ready: Effect.Effect<void>) => BareFiberProgram

export const readyOnStart = (program: BareFiberProgram): FiberProgram => (ready) => Effect.andThen(ready, program)

export const fiberPort = MediumPort<FiberProgram, never, Scope.Scope>('FiberMedium')

const FiberStartedTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-spec/FiberMedium/Started',
)
type FiberStartedTypeId = typeof FiberStartedTypeId
interface FiberStarted extends Started {
  readonly [FiberStartedTypeId]: FiberStartedTypeId
  readonly fiber: Fiber.Fiber<void, SupervisorTerminated>
}

const fiberStarted = (
  fiber: Fiber.Fiber<void, SupervisorTerminated>,
  ready: Effect.Effect<void>,
): FiberStarted => ({
  [StartedTypeId]: StartedTypeId,
  [FiberStartedTypeId]: FiberStartedTypeId,
  fiber,
  ready,
})

const isFiberStarted = (evidence: Started): evidence is FiberStarted => FiberStartedTypeId in evidence

const fiberOf = (evidence: Started): Option.Option<FiberStarted> => Option.liftPredicate(evidence, isFiberStarted)

const shutdownTermination: TerminationReason = { _tag: 'Shutdown' }

const decisionOf = (exit: Exit.Exit<void, SupervisorTerminated>): ChildExitDecision =>
  Result.match(classifyChildExit(new ClassifyChildExit({ stopping: false, exit })), {
    onFailure: (error: never): never => absurd(error),
    onSuccess: (decision) => decision,
  })

const terminationOf = (exit: Exit.Exit<void, SupervisorTerminated>): TerminationReason =>
  terminationReasonOf({ decision: decisionOf(exit), exit })

const forcedChild = (self: FiberStarted): Effect.Effect<void> => Fiber.interrupt(self.fiber)

const signalledWithin = (self: FiberStarted, millis: number): Effect.Effect<void> =>
  Effect.asVoid(Effect.timeoutOption(forcedChild(self), Duration.millis(millis)))

const stopOf = (self: FiberStarted, mode: ShutdownMode): Effect.Effect<void> =>
  Match.value(mode).pipe(
    Match.tag('Brutal', () => forcedChild(self)),
    Match.tag('Graceful', (graceful) => signalledWithin(self, graceful.millis)),
    Match.tag('Infinity', () => forcedChild(self)),
    Match.exhaustive,
  )

export const failureCauseOf = (
  evidence: Started,
): Option.Option<Effect.Effect<Option.Option<Cause.Cause<SupervisorTerminated>>>> =>
  Option.map(fiberOf(evidence), (self) => Effect.map(Fiber.await(self.fiber), Exit.getCause))

export const mediumFor = <R = never>(): MediumShape<
  (ready: Effect.Effect<void>) => Effect.Effect<void, SupervisorTerminated, Scope.Scope | R>,
  never,
  Scope.Scope | R
> =>
  make({
    declaration: { reporting: 'full', groupStop: 'atomic' },
    start: (program) =>
      Effect.gen(function*() {
        const scope = yield* Effect.scope
        const signalled = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkIn(program(Deferred.succeed(signalled, void 0)), scope)
        return fiberStarted(fiber, Deferred.await(signalled))
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
    stop: (evidence, mode): Effect.Effect<Stopped, never, Scope.Scope | R> =>
      Option.match(fiberOf(evidence), {
        onNone: () => Effect.succeed(stopped),
        onSome: (self) => Effect.as(stopOf(self, mode), stopped),
      }),
  })

export const medium: MediumShape<FiberProgram, never, Scope.Scope> = mediumFor<never>()
