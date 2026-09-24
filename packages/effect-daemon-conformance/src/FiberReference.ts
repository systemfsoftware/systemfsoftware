import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Effect, Match, Queue } from 'effect'
import type { ChildStep } from './ChildScript.schema.js'
import type { ConformanceDriver, LaunchedChild } from './driver.js'

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

const fiberProgramOf = (steps: Queue.Queue<ChildStep>): Supervisor.FiberProgram => (ready) => consume(steps, ready)

const launch = (
  _childId: string,
  _script: ReadonlyArray<ChildStep>,
): Effect.Effect<LaunchedChild<Supervisor.FiberProgram>, never, never> =>
  Effect.map(Queue.unbounded<ChildStep>(), (steps) => ({
    program: fiberProgramOf(steps),
    control: { advance: (step) => Effect.asVoid(Queue.offer(steps, step)) },
  }))

/**
 * The fiber medium as the reference every other medium is compared against. It
 * satisfies the driver contract trivially: one unbounded queue per child, a
 * program that takes steps from it, and a control that offers to the same queue.
 */
export const FiberReference: ConformanceDriver<Supervisor.FiberProgram, never, never> = {
  name: 'fiber',
  declaration: { reporting: 'full', groupStop: 'atomic' },
  port: Supervisor.FiberMedium.fiberPort,
  launch,
}
