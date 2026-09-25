import { Effect, Fiber, Queue, Scheduler } from 'effect'

/** A value read from code this file does not own, narrowed by predicates. */
type Field<A = unknown> = A

type HostImmediate = (callback: () => void) => Field
type ActiveResources = () => ReadonlyArray<string>

const isHostImmediate = (candidate: unknown): candidate is HostImmediate => typeof candidate === 'function'
const isActiveResources = (candidate: unknown): candidate is ActiveResources => typeof candidate === 'function'

const hostImmediate = (): HostImmediate => {
  const candidate: Field = Reflect.get(globalThis, 'setImmediate')
  if (!isHostImmediate(candidate)) throw new TypeError('the host has no setImmediate')
  return candidate
}

const activeResources = (): ReadonlyArray<string> => {
  const host: Field = Reflect.get(globalThis, 'process')
  const candidate: Field = Reflect.get(host ?? {}, 'getActiveResourcesInfo')
  if (!isActiveResources(candidate)) throw new TypeError('the host cannot list its active resources')
  return Reflect.apply(candidate, host, [])
}

const nextImmediate = (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  hostImmediate()(resolve)
  return promise
}

/**
 * Resolves once Effect's default dispatcher has nothing queued: it schedules
 * its work as host immediates, so no pending immediate means no fiber can run.
 */
const settled = (): Promise<void> =>
  nextImmediate().then(() => (activeResources().includes('Immediate') ? settled() : undefined))

export type Take = (queue: Queue.Queue<number>) => Effect.Effect<void>

export interface Setting {
  readonly budget: number
  readonly padding: number
}

const padded = (padding: number): Effect.Effect<void> =>
  Array.from({ length: padding }).reduce<Effect.Effect<void>>((pad) => Effect.andThen(pad, Effect.void), Effect.void)

/** A taker forked `padding` operations late, and an offer queued behind it. */
const scenario = (take: Take, padding: number) =>
  Effect.gen(function*() {
    const queue = yield* Queue.unbounded<number>()
    const taker = yield* Effect.forkDetach(Effect.andThen(padded(padding), take(queue)))
    yield* Effect.forkDetach(Queue.offer(queue, 1))
    return { queue, taker }
  })

/** Whether the taker is still waiting beside the offered message once nothing can run. */
const leavesTakerWaiting = (take: Take) => (setting: Setting): Promise<boolean> =>
  Effect.runPromise(
    scenario(take, setting.padding).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, setting.budget)),
  ).then(({ queue, taker }) =>
    settled().then(() => {
      const waiting = taker.pollUnsafe() === undefined
      const held = Effect.runSync(Queue.size(queue))
      return Effect.runPromise(Fiber.interrupt(taker)).then(() => waiting && held > 0)
    })
  )

const range = (from: number, to: number): ReadonlyArray<number> =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

const settings: ReadonlyArray<Setting> = range(3, 16).flatMap((budget) =>
  range(0, 40).map((padding): Setting => ({ budget, padding }))
)

export const sweepLostWakeups = (take: Take): Promise<ReadonlyArray<Setting>> =>
  settings.reduce<Promise<ReadonlyArray<Setting>>>(
    (found, setting) =>
      found.then((stuck) => leavesTakerWaiting(take)(setting).then((lost) => (lost ? [...stuck, setting] : stuck))),
    Promise.resolve([]),
  )
