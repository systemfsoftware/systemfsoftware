import { Effect, Fiber, HashMap, Metric, Option, Ref } from 'effect'
import type { Scope } from 'effect'
import type { ChildRef, DynamicHandle, SupervisorHealth } from '../daemon-health.schema.js'
import { DynamicLimitExceeded } from '../daemon-health.schema.js'
import { healthStateGauge, supervisorChildrenGauge } from '../daemon-metrics.kernel.js'
import type { DaemonReporter } from '../daemon-reporter.adapter.js'
import type { DynamicSpec } from '../daemon-spec.schema.js'
import type { LeaderLock } from '../leader-lock.adapter.js'
import { allocateSupervisorHealth } from './allocate-supervisor-health.kernel.js'
import { allocateWorkerHealth } from './allocate-worker-health.kernel.js'
import { buildWorkerLoop } from './build-worker-loop.kernel.js'

interface DynamicChildState<E> {
  readonly fiber: Option.Option<Fiber.RuntimeFiber<void, E>>
  readonly removed: Effect.Latch
}

interface DynamicState<E> {
  readonly nextId: number
  readonly children: HashMap.HashMap<number, DynamicChildState<E>>
}

const buildDynamic = <E, R, Args>(
  spec: DynamicSpec<E, R, Args>,
  health: SupervisorHealth,
): Effect.Effect<
  DynamicHandle<Args, R | LeaderLock | DaemonReporter | Scope.Scope>,
  never,
  R | LeaderLock | DaemonReporter | Scope.Scope
> =>
  Effect.gen(function*() {
    const state = yield* Ref.make<DynamicState<E>>({
      nextId: 0,
      children: HashMap.empty<number, DynamicChildState<E>>(),
    })

    const startChildImpl = (args: Args): Effect.Effect<
      ChildRef,
      DynamicLimitExceeded,
      R | LeaderLock | DaemonReporter | Scope.Scope
    > =>
      Effect.gen(function*() {
        const childWorker = spec.child(args)
        const workerHealth = yield* allocateWorkerHealth(childWorker.name)
        const loop = buildWorkerLoop(childWorker, workerHealth, healthStateGauge).pipe(Effect.orDie)
        const removed = yield* Effect.makeLatch(false)
        const reservedId = yield* Ref.modify(state, (current) => {
          if (HashMap.size(current.children) >= spec.maxChildren) {
            return [Option.none<number>(), current] as const
          }
          const children = HashMap.set(current.children, current.nextId, {
            fiber: Option.none<Fiber.RuntimeFiber<void, E>>(),
            removed,
          })
          return [
            Option.some(current.nextId),
            {
              nextId: current.nextId + 1,
              children,
            },
          ] as const
        })
        if (Option.isNone(reservedId)) {
          return yield* new DynamicLimitExceeded({ limit: spec.maxChildren })
        }
        const id = reservedId.value
        yield* Metric.set(
          supervisorChildrenGauge,
          HashMap.size(yield* Ref.get(state).pipe(Effect.map((s) => s.children))),
        )

        const cleanup = Effect.gen(function*() {
          const count = yield* Ref.modify(state, (current) => {
            const children = HashMap.remove(current.children, id)
            return [HashMap.size(children), { ...current, children }] as const
          })
          yield* Metric.set(supervisorChildrenGauge, count)
          yield* removed.open
        }).pipe(Effect.asVoid)

        const fiber = yield* Effect.forkScoped(
          loop.pipe(Effect.ensuring(cleanup)),
        )

        const count = yield* Ref.modify(state, (current) => {
          const childOpt = HashMap.get(current.children, id)
          if (Option.isNone(childOpt)) {
            return [HashMap.size(current.children), current] as const
          }
          const children = HashMap.set(current.children, id, {
            ...childOpt.value,
            fiber: Option.some(fiber),
          })
          return [
            HashMap.size(children),
            {
              nextId: current.nextId,
              children,
            },
          ] as const
        })
        yield* Metric.set(supervisorChildrenGauge, count)

        return { id, removed: removed.await }
      })

    const stopChildImpl = (ref: Pick<ChildRef, 'id'>): Effect.Effect<void> =>
      Effect.gen(function*() {
        const [stateOpt, count] = yield* Ref.modify(state, (current) => {
          const found = HashMap.get(current.children, ref.id)
          const children = HashMap.remove(current.children, ref.id)
          return [[found, HashMap.size(children)] as const, { ...current, children }] as const
        })

        if (Option.isSome(stateOpt)) {
          const { fiber, removed } = stateOpt.value
          yield* Option.match(fiber, {
            onNone: () => Effect.void,
            onSome: (running) =>
              Effect.gen(function*() {
                yield* Fiber.interrupt(running)
                yield* Fiber.await(running)
              }),
          })
          yield* Metric.set(supervisorChildrenGauge, count)
          yield* removed.open
        }
      })

    const countImpl: Effect.Effect<number> = Ref.get(state).pipe(
      Effect.map((current) => HashMap.size(current.children)),
    )

    yield* Effect.zipRight(
      health.ready.open,
      Metric.set(Metric.tagged(Metric.tagged(healthStateGauge, 'daemon', spec.name), 'latch', 'ready'), 1),
    )

    return {
      health,
      startChild: startChildImpl,
      stopChild: stopChildImpl,
      count: countImpl,
    }
  })

export const dynamic = <E, R, Args>(
  spec: DynamicSpec<E, R, Args>,
): Effect.Effect<
  DynamicHandle<Args, R | LeaderLock | DaemonReporter | Scope.Scope>,
  never,
  R | LeaderLock | DaemonReporter | Scope.Scope
> =>
  Effect.gen(function*() {
    const health = yield* allocateSupervisorHealth(spec.name, [])
    const handle = yield* buildDynamic(spec, health)
    return handle
  })
