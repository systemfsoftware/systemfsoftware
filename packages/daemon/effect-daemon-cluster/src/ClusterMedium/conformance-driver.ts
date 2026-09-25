import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Effect, Match, Queue } from 'effect'
import type { Scope } from 'effect'
import type { Sharding } from 'effect/unstable/cluster'
import type { ClusterProgram } from './ClusterProgram.js'
import { singletonChild } from './ClusterProgram.js'
import { declaration, port } from './medium.js'

const consume = (steps: Queue.Queue<Conformance.ChildStep>, ready: Effect.Effect<void>): Effect.Effect<void> =>
  Effect.flatMap(Queue.take(steps), (step) => continueOf(step, steps, ready))

const continueOf = (
  step: Conformance.ChildStep,
  steps: Queue.Queue<Conformance.ChildStep>,
  ready: Effect.Effect<void>,
): Effect.Effect<void> =>
  Match.value(step).pipe(
    Match.tag('BecomeReady', () => Effect.andThen(ready, consume(steps, ready))),
    Match.tag('ExitNormal', () => Effect.void),
    Match.tag('ExitAbnormal', () => Effect.die(new Error('scripted abnormal exit'))),
    Match.tag('IgnoreGracefulStop', () => Effect.never),
    Match.tag('NeverBecomeReady', () => Effect.never),
    Match.exhaustive,
  )

const launch = (
  childId: string,
  _script: ReadonlyArray<Conformance.ChildStep>,
): Effect.Effect<Conformance.LaunchedChild<ClusterProgram>, never, Scope.Scope | Sharding.Sharding> =>
  Effect.map(Queue.unbounded<Conformance.ChildStep>(), (steps) => ({
    program: singletonChild({ name: `conformance/${childId}`, run: (ready) => consume(steps, ready) }),
    control: { advance: (step, _generation) => Effect.asVoid(Queue.offer(steps, step)) },
  }))

export const conformanceDriver: Conformance.ConformanceDriver<ClusterProgram, never, Sharding.Sharding> = {
  name: 'cluster',
  declaration,
  port,
  launch,
}
