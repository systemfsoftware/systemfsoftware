/// <reference types="node" />
import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Scheduler from 'effect/Scheduler'
import * as TestClock from 'effect/testing/TestClock'

interface VirtualSleeper {
  readonly at: number
  readonly observer: boolean
  readonly sequence: number
  readonly wake: () => void
}

interface VirtualTime {
  readonly now: () => number
  readonly sleepers: () => ReadonlyArray<VirtualSleeper>
  readonly addSleeper: (sleeper: VirtualSleeper) => void
  readonly removeSleeper: (sleeper: VirtualSleeper) => void
  readonly advanceTo: (at: number) => void
  readonly claimSequence: () => number
  readonly pendingTasks: () => number
  readonly beginTask: () => void
  readonly completeTask: () => void
}

/** @internal */
export interface VirtualRuntime {
  readonly clock: Clock.Clock
  readonly scheduler: Scheduler.Scheduler
  /** @internal */
  readonly observe: Effect.Effect<void, never, never>
  /** @internal */
  readonly end: Effect.Effect<void, never, never>
}

const roundNanos = (millis: number): bigint => BigInt(Math.round(millis * 1_000_000))

const byWakeOrder = (first: VirtualSleeper, second: VirtualSleeper): number => {
  const time = first.at - second.at
  if (time !== 0) return time
  return tieBreak(first, second)
}

const tieBreak = (first: VirtualSleeper, second: VirtualSleeper): number => {
  const role = Number(first.observer) - Number(second.observer)
  if (role !== 0) return role
  return first.sequence - second.sequence
}

const sortSleepers = (sleepers: Array<VirtualSleeper>): void => {
  sleepers.sort(byWakeOrder)
}

const dueNow = (
  sleepers: ReadonlyArray<VirtualSleeper>,
  now: number,
  observer: boolean,
): Array<VirtualSleeper> => sleepers.filter((sleeper) => sleeper.at <= now && sleeper.observer === observer)

const removeAll = (time: VirtualTime, due: ReadonlyArray<VirtualSleeper>): void => {
  due.forEach((sleeper) => time.removeSleeper(sleeper))
}

const wakeAll = (due: ReadonlyArray<VirtualSleeper>): void => {
  due.forEach((sleeper) => sleeper.wake())
}

const runnable = (frozen: boolean, queued: number): boolean => frozen === false && queued > 0

const settledForAdvance = (frozen: boolean, pending: number, queued: number): boolean =>
  runnable(frozen, queued) && pending === 0

const shouldStartAdvance = (watching: { checking: boolean; frozen: boolean }, time: VirtualTime): boolean =>
  watching.checking === false && runnable(watching.frozen, time.sleepers().length)

const removeEntry = (entries: Array<VirtualSleeper>, entry: VirtualSleeper): void => {
  const index = entries.indexOf(entry)
  if (index !== -1) entries.splice(index, 1)
}

const makeVirtualTime = (): VirtualTime => {
  const sleepers: Array<VirtualSleeper> = []
  const state = { now: 0, sequence: 0, pending: 0 }
  return {
    now: () => state.now,
    sleepers: () => sleepers,
    addSleeper: (sleeper) => {
      sleepers.push(sleeper)
    },
    removeSleeper: (sleeper) => removeEntry(sleepers, sleeper),
    advanceTo: (at) => {
      state.now = Math.max(state.now, at)
    },
    claimSequence: () => claimNext(state),
    pendingTasks: () => state.pending,
    beginTask: () => {
      state.pending = state.pending + 1
    },
    completeTask: () => {
      state.pending = state.pending - 1
    },
  }
}

const claimNext = (state: { sequence: number }): number => {
  const claimed = state.sequence
  state.sequence = claimed + 1
  return claimed
}

const runTracked = (time: VirtualTime, task: () => void, advance: () => void): void => {
  try {
    task()
  } finally {
    time.completeTask()
    if (time.pendingTasks() === 0) advance()
  }
}
const sleepUntil = (
  time: VirtualTime,
  advance: () => void,
  observerOf: () => number,
  duration: Duration.Duration,
): Effect.Effect<void, never, never> => {
  if (Duration.toMillis(duration) <= 0) return Effect.void
  return Effect.flatMap(Effect.fiberId, (fiberId) =>
    Effect.callback<void>((resume) => {
      const sleeper: VirtualSleeper = {
        at: time.now() + Duration.toMillis(duration),
        observer: fiberId === observerOf(),
        sequence: time.claimSequence(),
        wake: () => resume(Effect.void),
      }
      time.addSleeper(sleeper)
      advance()
      return Effect.sync(() => time.removeSleeper(sleeper))
    }))
}

/** @internal */
export const makeVirtualRuntime = (): VirtualRuntime => {
  const inner = new Scheduler.MixedScheduler()
  const time = makeVirtualTime()
  const watching = { checking: false, frozen: false, observer: -1 }

  const advanceWhenIdle = (): void => {
    if (shouldStartAdvance(watching, time) === false) return
    watching.checking = true
    setImmediate(advanceFromIdle)
  }

  const advanceFromIdle = (): void => {
    watching.checking = false
    if (settledForAdvance(watching.frozen, time.pendingTasks(), time.sleepers().length) === false) return
    wakeEarliest(time)
    advanceWhenIdle()
  }

  const scheduler: Scheduler.Scheduler = {
    executionMode: inner.executionMode,
    shouldYield: (fiber) => inner.shouldYield(fiber),
    makeDispatcher: () => {
      const dispatcher = inner.makeDispatcher()
      return {
        scheduleTask: (task, priority) => {
          time.beginTask()
          dispatcher.scheduleTask(() => runTracked(time, task, advanceWhenIdle), priority)
        },
        flush: () => dispatcher.flush(),
      }
    },
  }

  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => time.now(),
    currentTimeMillis: Effect.sync(() => time.now()),
    currentTimeNanosUnsafe: () => roundNanos(time.now()),
    currentTimeNanos: Effect.sync(() => roundNanos(time.now())),
    monotonicTimeNanosUnsafe: () => roundNanos(time.now()),
    monotonicTimeNanos: Effect.sync(() => roundNanos(time.now())),
    sleep: (duration) => sleepUntil(time, advanceWhenIdle, () => watching.observer, duration),
  }

  const observe = Effect.flatMap(Effect.fiberId, (id) =>
    Effect.sync((): void => {
      watching.observer = id
    }))
  const end = Effect.sync((): void => {
    watching.frozen = true
  })
  return { clock, scheduler, observe, end }
}

const wakeEarliest = (time: VirtualTime): void => {
  const ordered = [...time.sleepers()]
  sortSleepers(ordered)
  const first = ordered[0]
  if (first === undefined) return
  time.advanceTo(first.at)
  const due = dueNow(time.sleepers(), time.now(), first.observer)
  removeAll(time, due)
  wakeAll(due)
}

/**
 * The clock a virtual-time test runs on: a `Clock` that also answers the
 * `TestClock` interface, so `TestClock.adjust` moves virtual time by letting
 * that much time pass instead of waiting for a real clock (KTD6, R7).
 *
 * @internal
 */
export const virtualClockLayer = (runtime: VirtualRuntime): Layer.Layer<never> =>
  Layer.succeed(Clock.Clock, virtualClockOf(runtime))

const virtualClockOf = (runtime: VirtualRuntime): TestClock.TestClock => {
  const live = runtime.clock
  return {
    currentTimeMillisUnsafe: () => live.currentTimeMillisUnsafe(),
    currentTimeMillis: Effect.sync((): number => live.currentTimeMillisUnsafe()),
    currentTimeNanosUnsafe: () => live.currentTimeNanosUnsafe(),
    currentTimeNanos: Effect.sync((): bigint => live.currentTimeNanosUnsafe()),
    monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: Effect.sync((): bigint => live.monotonicTimeNanosUnsafe()),
    sleep: (duration) => live.sleep(duration),
    adjust: (duration) => Effect.sleep(duration),
    setTime: (timestamp) =>
      Effect.suspend(() => Effect.sleep(Duration.millis(Math.max(0, timestamp - live.currentTimeMillisUnsafe())))),
    withLive: (effect) => Effect.provideService(effect, Clock.Clock, live),
  }
}
