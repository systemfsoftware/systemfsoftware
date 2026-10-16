import type { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Cause, Deferred, Effect, Exit, Fiber, Layer, Match, Option, Queue, Scope } from 'effect'

const StoppedEarlyTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-conformance/StoppedEarlyStarted',
)
type StoppedEarlyTypeId = typeof StoppedEarlyTypeId

interface StoppedEarlyStarted extends Supervisor.Medium.Started {
  readonly [StoppedEarlyTypeId]: StoppedEarlyTypeId
  readonly fiber: Fiber.Fiber<void, never>
  readonly scope: Scope.Scope
  readonly stopping: Deferred.Deferred<void>
}

const stoppedEarlyOf = (evidence: Supervisor.Medium.Started): Option.Option<StoppedEarlyStarted> =>
  Option.filter(
    Option.some(evidence),
    (candidate): candidate is StoppedEarlyStarted => StoppedEarlyTypeId in candidate,
  )

const LATE_HOPS = 3

const lateHops = (): Effect.Effect<void> =>
  Effect.forEach(Arr.range(1, LATE_HOPS), () => Effect.yieldNow, { discard: true })

const consume = (
  steps: Queue.Queue<Conformance.ChildStep>,
  ready: Effect.Effect<void>,
): Effect.Effect<void, never, never> => Effect.flatMap(Queue.take(steps), (step) => continueOf(step, steps, ready))

const continueOf = (
  step: Conformance.ChildStep,
  steps: Queue.Queue<Conformance.ChildStep>,
  ready: Effect.Effect<void>,
): Effect.Effect<void, never, never> =>
  Match.value(step).pipe(
    Match.tag('BecomeReady', () => Effect.andThen(ready, consume(steps, ready))),
    Match.tag('ExitNormal', () => Effect.void),
    Match.tag('ExitAbnormal', () => Effect.die(new Error('scripted abnormal exit'))),
    Match.tag('IgnoreGracefulStop', () => Effect.never),
    Match.tag('NeverBecomeReady', () => Effect.never),
    Match.exhaustive,
  )

const terminationOf = (exit: Exit.Exit<void, never>): Supervisor.Medium.TerminationReason =>
  Exit.match(exit, {
    onSuccess: () => ({ _tag: 'Normal' }),
    onFailure: (cause) => ({
      _tag: 'Abnormal',
      report: { _tag: 'CauseReport', cause: Cause.pretty(cause) },
    }),
  })

/**
 * A fiber medium with the process medium's stop ordering: a stop is reported as a `Shutdown`
 * the moment it is asked for, while the program it interrupts keeps running for three hops.
 * Its consumer therefore reads the channel while the kernel has already closed the incarnation
 * in, which is what a driver has to make safe.
 */
const medium: Supervisor.Medium.Medium<Supervisor.FiberProgram, never, Scope.Scope> = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (program) =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const ready = yield* Deferred.make<void>()
      const stopping = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkIn(program(Deferred.await(ready)), scope)
      return Object.assign(Supervisor.Medium.started(Effect.void), {
        [StoppedEarlyTypeId]: StoppedEarlyTypeId,
        fiber,
        scope,
        stopping,
      })
    }),
  report: (evidence) =>
    Option.match(stoppedEarlyOf(evidence), {
      onNone: () => Effect.succeed<Supervisor.Medium.TerminationReason>({ _tag: 'Shutdown' }),
      onSome: (self) =>
        Effect.raceFirst(
          Effect.as(Deferred.await(self.stopping), { _tag: 'Shutdown' } as const),
          Effect.map(Fiber.await(self.fiber), terminationOf),
        ),
    }),
  probe: (evidence) =>
    Option.match(stoppedEarlyOf(evidence), {
      onNone: () => Effect.succeed(false),
      onSome: (self) => Effect.sync(() => self.fiber.pollUnsafe() === undefined),
    }),
  stop: (evidence) =>
    Option.match(stoppedEarlyOf(evidence), {
      onNone: () => Effect.succeed(Supervisor.Medium.stopped),
      onSome: (self) =>
        Effect.as(
          Effect.andThen(
            Deferred.succeed(self.stopping, void 0),
            Effect.andThen(lateHops(), Fiber.interrupt(self.fiber)),
          ),
          Supervisor.Medium.stopped,
        ),
    }),
})

const port = Supervisor.Medium.MediumPort<Supervisor.FiberProgram, never, Scope.Scope>('StoppedEarlyMedium')

const launch = (
  _childId: string,
  _script: ReadonlyArray<Conformance.ChildStep>,
): Effect.Effect<Conformance.LaunchedChild<Supervisor.FiberProgram>, never, never> =>
  Effect.map(Queue.unbounded<Conformance.ChildStep>(), (steps) => ({
    program: (ready) => consume(steps, ready),
    control: { advance: (step, _generation) => Effect.asVoid(Queue.offer(steps, step)) },
  }))

/** A medium that reports a stop before its incarnation stops, driven over one channel per child: the step a restarted incarnation is for reaches the dying one. */
export const SharedChannelMedium: Conformance.ConformanceDriver<Supervisor.FiberProgram, never, never> = {
  name: 'shared-channel',
  declaration: { reporting: 'full', groupStop: 'atomic' },
  port,
  launch,
}

/** The shared-channel medium bound to its port, for a caller to provide. */
export const SharedChannelMediumLayer: Layer.Layer<
  Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>
> = Layer.succeed(port, { medium })
