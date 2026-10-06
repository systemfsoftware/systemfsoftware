import type { EventObject, Snapshot } from '@systemfsoftware/xstate'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import type * as fc from 'fast-check'
import type { TestReference, TestSut, TestSutSession } from './engine/index.js'

let currentScheduler: fc.Scheduler | undefined

/**
 * Awaits `value` as an Effect. A value and a thenable are both accepted, and a
 * rejection stays the same error object when the effect is run.
 */
const awaited = <A>(value: A | PromiseLike<A>): Effect.Effect<Awaited<A>> =>
  Effect.promise(() => Promise.resolve(value))

/**
 * The scheduler fast-check generated for the run currently in flight, or
 * `undefined` when the adapter was not configured with `scheduler`.
 *
 * Only defined while a scheduled run is executing, which is exactly when a
 * system under test is created and driven.
 *
 * @experimental
 */
export function getCurrentScheduler(): fc.Scheduler | undefined {
  return currentScheduler
}

/** @internal */
export const withCurrentScheduler: {
  <T>(
    run: () => Promise<T>,
  ): (scheduler: fc.Scheduler | undefined) => Promise<T>
  <T>(
    scheduler: fc.Scheduler | undefined,
    run: () => Promise<T>,
  ): Promise<T>
} = dual(2, function withCurrentScheduler<T>(
  scheduler: fc.Scheduler | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const previous = currentScheduler
  currentScheduler = scheduler
  return run().finally(() => {
    currentScheduler = previous
  })
})

function scheduleMethod<TArgs extends unknown[], T>(
  scheduler: fc.Scheduler,
  method: ((...args: TArgs) => T | Promise<T>) | undefined,
): ((...args: TArgs) => Promise<T>) | undefined {
  if (method === undefined) {
    return undefined
  }
  return scheduler.scheduleFunction(
    (...args: TArgs) => Effect.runPromise(awaited(method(...args))),
  )
}

/**
 * Wraps a {@link TestSut} so its asynchronous boundaries (`send`, `read`,
 * `settle`, `advance`) resolve in an order chosen by the run's fast-check
 * scheduler instead of in plain microtask order.
 *
 * The wrapper binds to {@link getCurrentScheduler} when the session is created,
 * so it is inert unless the adapter was configured with `scheduler`.
 *
 * @experimental
 */
export function withScheduledSut<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
>(sut: TestSut<TSnapshot, TEvent>): TestSut<TSnapshot, TEvent> {
  return {
    ...sut,
    create: (context) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const scheduler = getCurrentScheduler()
          const session = yield* awaited(sut.create(context))
          if (scheduler === undefined) {
            return session
          }
          const send = scheduler.scheduleFunction(
            (
              event: TEvent,
              sendContext: Parameters<
                TestSutSession<TSnapshot, TEvent>['send']
              >[1],
            ) => Promise.resolve(session.send(event, sendContext)),
          )
          const read = session.read !== undefined
            ? scheduler.scheduleFunction(() => Promise.resolve(session.read!()))
            : undefined
          const settle = scheduleMethod(scheduler, session.settle?.bind(session))
          const advance = scheduleMethod(
            scheduler,
            session.advance?.bind(session),
          )
          return {
            ...session,
            send: (event, sendContext) => send(event, sendContext),
            ...(read !== undefined ? { read: () => read() } : {}),
            ...(settle !== undefined ? { settle: () => settle() } : {}),
            ...(advance !== undefined
              ? { advance: (milliseconds: number) => advance(milliseconds) }
              : {}),
          }
        }),
      ),
  }
}

/**
 * Wraps a reference oracle the way {@link withScheduledSut} wraps a system
 * under test: its `transition` and `read` calls resolve under the run's
 * scheduler.
 *
 * @experimental
 */
export function withScheduledReference<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
>(
  reference: TestReference<TSnapshot, TEvent>,
): TestReference<TSnapshot, TEvent> {
  return {
    ...reference,
    create: (context) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const scheduler = getCurrentScheduler()
          const session = yield* awaited(reference.create(context))
          if (scheduler === undefined) {
            return session
          }
          const step = scheduler.scheduleFunction(
            (event: TEvent) => Promise.resolve(session.transition(event)),
          )
          const read = scheduler.scheduleFunction(() => Promise.resolve(session.read()))
          return {
            ...session,
            transition: (event) => step(event),
            read: () => read(),
          }
        }),
      ),
  }
}
