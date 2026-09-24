import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Cause, Effect, Exit, Fiber, Layer, Match, Option, Queue, Scope } from 'effect'
import type { ChildStep } from '../../src/ChildScript.schema.js'
import type { ConformanceDriver, LaunchedChild } from '../../src/driver.js'

const PlantedTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-conformance/PlantedStarted')
type PlantedTypeId = typeof PlantedTypeId

interface PlantedStarted extends Supervisor.Medium.Started {
  readonly [PlantedTypeId]: PlantedTypeId
  readonly fiber: Fiber.Fiber<void, never>
  readonly scope: Scope.Scope
}

const plantedOf = (evidence: Supervisor.Medium.Started): Option.Option<PlantedStarted> =>
  Option.filter(
    Option.some(evidence),
    (candidate): candidate is PlantedStarted => PlantedTypeId in candidate,
  )

const consume = (steps: Queue.Queue<ChildStep>, ready: Effect.Effect<void>): Effect.Effect<void, never, never> =>
  Effect.flatMap(Queue.take(steps), (step) => continueOf(step, steps, ready))

const continueOf = (
  step: ChildStep,
  steps: Queue.Queue<ChildStep>,
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

const medium: Supervisor.Medium.Medium<Supervisor.FiberProgram, never, Scope.Scope> = Supervisor.Medium.make({
  declaration: { reporting: 'full', groupStop: 'atomic' },
  start: (_program) =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      // The plant: the child is reported ready though its program never runs.
      const fiber = yield* Effect.forkIn(Effect.never, scope)
      return Object.assign(Supervisor.Medium.started(Effect.void), {
        [PlantedTypeId]: PlantedTypeId,
        fiber,
        scope,
      })
    }),
  report: (evidence) =>
    Option.match(plantedOf(evidence), {
      onNone: () => Effect.succeed({ _tag: 'Shutdown' } as const),
      onSome: (self) =>
        Effect.map(Fiber.await(self.fiber), (exit) =>
          Exit.match(exit, {
            onSuccess: () => ({ _tag: 'Normal' } as const),
            onFailure: (cause) => ({
              _tag: 'Abnormal' as const,
              report: { _tag: 'CauseReport' as const, cause: Cause.pretty(cause) },
            }),
          })),
    }),
  probe: (evidence) =>
    Option.match(plantedOf(evidence), {
      onNone: () => Effect.succeed(false),
      onSome: (self) => Effect.sync(() => self.fiber.pollUnsafe() === undefined),
    }),
  stop: (evidence) =>
    Option.match(plantedOf(evidence), {
      onNone: () => Effect.succeed(Supervisor.Medium.stopped),
      onSome: (self) =>
        Effect.as(
          Effect.andThen(Fiber.interrupt(self.fiber), Scope.close(self.scope, Exit.void)),
          Supervisor.Medium.stopped,
        ),
    }),
})

const port = Supervisor.Medium.MediumPort<Supervisor.FiberProgram, never, Scope.Scope>('PlantedMedium')

const launch = (
  _childId: string,
  _script: ReadonlyArray<ChildStep>,
): Effect.Effect<LaunchedChild<Supervisor.FiberProgram>, never, never> =>
  Effect.map(Queue.unbounded<ChildStep>(), (steps) => ({
    program: (ready) => consume(steps, ready),
    control: { advance: (step) => Effect.asVoid(Queue.offer(steps, step)) },
  }))

/** A medium that reports a child ready without starting it — the AE10 plant, which must diverge. */
export const PlantedMedium: ConformanceDriver<Supervisor.FiberProgram, never, never> = {
  name: 'planted',
  declaration: { reporting: 'full', groupStop: 'atomic' },
  port,
  launch,
}

/** The planted medium bound to its port, for a caller to provide. */
export const PlantedMediumLayer: Layer.Layer<
  Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>
> = Layer.succeed(port, { medium })
