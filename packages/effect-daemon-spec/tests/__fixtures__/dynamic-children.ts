import type { ChildRef } from '@systemfsoftware/effect-daemon-spec'
import { Daemon, dynamic, MaxChildren, run } from '@systemfsoftware/effect-daemon-spec'
import type { DaemonReporter, LeaderLock } from '@systemfsoftware/effect-daemon-spec'
import { Context, Deferred, Duration, Effect, Layer, Match, Ref, Scope, Stream } from 'effect'

import type { DynamicChildrenCommand } from './dynamic-children.model.js'
import { NoopLayer } from './SharedLayers.js'

const UNKNOWN_CHILD_ID = -1

export interface DynamicChildrenHandle {
  readonly startChild: Effect.Effect<number>
  readonly stopChild: Effect.Effect<number>
  readonly stopUnknownChild: Effect.Effect<number>
  readonly readCount: Effect.Effect<number>
}

export class DynamicChildren extends Context.Service<DynamicChildren, DynamicChildrenHandle>()(
  '@systemfsoftware/effect-daemon-spec/tests/dynamic-children.conformance.test/DynamicChildren',
) {}

const arrivingChild = (arrival: Deferred.Deferred<void>) =>
  Daemon.stream({
    name: 'bookkeeping-child',
    stream: Stream.concat(Stream.fromEffect(Deferred.succeed(arrival, void 0)), Stream.never),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

const bookkeepingSupervisor = dynamic({
  name: 'bookkeeping-supervisor',
  child: (arrival: Deferred.Deferred<void>) => arrivingChild(arrival),
  maxChildren: MaxChildren.make(1000),
})

export const dynamicChildrenLayer: Layer.Layer<DynamicChildren> = Layer.effect(
  DynamicChildren,
  Effect.gen(function*() {
    const layerScope = yield* Effect.scope
    const withEnv = <A>(
      effect: Effect.Effect<A, never, DaemonReporter | LeaderLock | Scope.Scope>,
    ): Effect.Effect<A> => effect.pipe(Effect.provideService(Scope.Scope, layerScope), Effect.provide(NoopLayer))
    const handle = yield* withEnv(run.dynamic(bookkeepingSupervisor))
    const started = yield* Ref.make<ReadonlyArray<ChildRef>>([])
    return DynamicChildren.of({
      startChild: withEnv(Effect.gen(function*() {
        const arrival = yield* Deferred.make<void>()
        const ref = yield* handle.startChild(arrival).pipe(Effect.orDie)
        yield* Deferred.await(arrival)
        yield* Ref.update(started, (refs) => [...refs, ref])
        return yield* handle.count
      })),
      stopChild: withEnv(Effect.gen(function*() {
        const last = yield* Ref.modify(started, (refs) => [refs[refs.length - 1], refs.slice(0, -1)] as const)
        if (last === undefined) return yield* handle.count
        yield* handle.stopChild(last)
        yield* last.removed
        return yield* handle.count
      })),
      stopUnknownChild: withEnv(Effect.gen(function*() {
        yield* handle.stopChild({ id: UNKNOWN_CHILD_ID })
        return yield* handle.count
      })),
      readCount: withEnv(handle.count),
    })
  }),
)

export const runDynamicChildrenCommand = (
  command: DynamicChildrenCommand,
): Effect.Effect<number, never, DynamicChildren> =>
  Effect.flatMap(DynamicChildren, (children) =>
    Match.value(command).pipe(
      Match.tag('StartChild', () => children.startChild),
      Match.tag('StopChild', () => children.stopChild),
      Match.tag('StopUnknownChild', () => children.stopUnknownChild),
      Match.tag('ReadCount', () => children.readCount),
      Match.exhaustive,
    ))
