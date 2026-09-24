/**
 * The kernel's clocks (R2, R37). The root clock is virtual time the run owns:
 * every sleep registers here, no host timer is ever created, and `advance`
 * fires the earliest due batch in registration order at quiescence. The test
 * clock is what a harness provides in place of `TestClock.layer()`: its
 * `adjust` and `setTime` suspend the caller, and the kernel settles one
 * request per quiescence, firing due batches in timestamp order and letting
 * everything they wake run to a stop before the next one. State lives in the
 * factory closures; nothing module-level survives a release.
 */
import { Clock, Duration, Effect } from 'effect'

import type { TestClock } from '../Kernel/TestClock.js'
import { currentKernel } from './runMark.js'

const NANOS_PER_MILLI = 1_000_000n

/** One registered sleep, with the order it registered in. */
interface VirtualTimer {
  readonly at: number
  readonly seq: number
  readonly wake: () => void
}

/**
 * The virtual-time state both kernel clocks share: the current millisecond, the
 * registered sleeps, and the ways time moves. `advance` fires the earliest due
 * batch and reports whether anything was due; `moveTo` moves the clock forward
 * without firing anything; `earliestDueAt` names the next wake-up.
 */
/** @internal */
export interface VirtualTime {
  readonly currentTimeMillisUnsafe: () => number
  readonly currentTimeNanosUnsafe: () => bigint
  readonly monotonicTimeNanosUnsafe: () => bigint
  readonly sleep: (duration: Duration.Duration) => Effect.Effect<void>
  readonly advance: () => boolean
  readonly earliestDueAt: () => number | undefined
  readonly moveTo: (target: number) => void
}

const removeBy = <T>(items: Array<T>, item: T): void => {
  const index = items.indexOf(item)
  if (index >= 0) items.splice(index, 1)
}

const dueBatchAt = (timers: ReadonlyArray<VirtualTimer>, at: number): ReadonlyArray<VirtualTimer> =>
  timers.filter((timer) => timer.at === at).sort((first, second) => first.seq - second.seq)

const fireAll = (due: ReadonlyArray<VirtualTimer>): void => {
  for (const timer of due) timer.wake()
}

const dropDueAt = (timers: Array<VirtualTimer>, at: number): void => {
  const kept = timers.filter((timer) => timer.at !== at)
  timers.splice(0, timers.length, ...kept)
}

const earliestDueAtOf = (timers: ReadonlyArray<VirtualTimer>): number | undefined =>
  timers.length === 0 ? undefined : Math.min(...timers.map((timer) => timer.at))

const sleepFor = (
  timers: Array<VirtualTimer>,
  now: () => number,
  seq: () => number,
  duration: Duration.Duration,
): Effect.Effect<void> => {
  const millis = Duration.toMillis(duration)
  if (millis <= 0) return Effect.yieldNow
  return Effect.callback<void>((resume) => {
    const timer: VirtualTimer = { at: now() + millis, seq: seq(), wake: () => resume(Effect.void) }
    timers.push(timer)
    return Effect.sync(() => {
      removeBy(timers, timer)
    })
  })
}

/** @internal */
export const makeVirtualTime = (): VirtualTime => {
  const timers: Array<VirtualTimer> = []
  let now = 0
  let seq = 0
  const currentTimeMillisUnsafe = (): number => now
  const currentTimeNanosUnsafe = (): bigint => BigInt(Math.trunc(now)) * NANOS_PER_MILLI
  const nextSeq = (): number => {
    seq++
    return seq
  }
  const advance = (): boolean => {
    const at = earliestDueAtOf(timers)
    if (at === undefined) return false
    const due = dueBatchAt(timers, at)
    dropDueAt(timers, at)
    now = at
    fireAll(due)
    return true
  }
  return {
    currentTimeMillisUnsafe,
    currentTimeNanosUnsafe,
    monotonicTimeNanosUnsafe: currentTimeNanosUnsafe,
    sleep: (duration) => sleepFor(timers, currentTimeMillisUnsafe, nextSeq, duration),
    advance,
    earliestDueAt: () => earliestDueAtOf(timers),
    moveTo: (target) => {
      now = Math.max(now, target)
    },
  }
}

/** The `Clock` members every kernel clock derives from its virtual time. */
interface ClockMembers {
  readonly currentTimeMillisUnsafe: () => number
  readonly currentTimeMillis: Effect.Effect<number>
  readonly currentTimeNanosUnsafe: () => bigint
  readonly currentTimeNanos: Effect.Effect<bigint>
  readonly monotonicTimeNanosUnsafe: () => bigint
  readonly monotonicTimeNanos: Effect.Effect<bigint>
  readonly sleep: (duration: Duration.Duration) => Effect.Effect<void>
}

const clockMembersOf = (time: VirtualTime): ClockMembers => ({
  currentTimeMillisUnsafe: time.currentTimeMillisUnsafe,
  currentTimeMillis: Effect.sync(time.currentTimeMillisUnsafe),
  currentTimeNanosUnsafe: time.currentTimeNanosUnsafe,
  currentTimeNanos: Effect.sync(time.currentTimeNanosUnsafe),
  monotonicTimeNanosUnsafe: time.monotonicTimeNanosUnsafe,
  monotonicTimeNanos: Effect.sync(time.monotonicTimeNanosUnsafe),
  sleep: time.sleep,
})

/**
 * The root clock of a run: virtual time, plus the one quiescent move the loop
 * makes when nothing else can run.
 */
/** @internal */
export interface KernelClock extends Clock.Clock {
  readonly advance: () => boolean
}

/** @internal */
export const makeKernelClock = (): KernelClock => {
  const time = makeVirtualTime()
  return {
    ...clockMembersOf(time),
    advance: time.advance,
  }
}

/** A pending `adjust` or `setTime`, oldest first. */
interface TimeRequest {
  readonly target: number
  readonly resume: () => void
}

const requestMoveTo = (requests: Array<TimeRequest>, target: number): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const request: TimeRequest = { target, resume: () => resume(Effect.void) }
    requests.push(request)
    return Effect.sync(() => {
      removeBy(requests, request)
    })
  })

const isDueBy = (time: VirtualTime, target: number): boolean => {
  const at = time.earliestDueAt()
  return at !== undefined && at <= target
}

const advanceToward = (
  time: VirtualTime,
  requests: Array<TimeRequest>,
  request: TimeRequest,
): boolean => {
  if (isDueBy(time, request.target)) return time.advance()
  time.moveTo(request.target)
  requests.shift()
  request.resume()
  return true
}

const settleOldest = (time: VirtualTime, requests: Array<TimeRequest>): boolean => {
  const request = requests[0]
  if (request === undefined) return false
  return advanceToward(time, requests, request)
}

/**
 * The test clock a harness provides in place of `TestClock.layer()`, with the
 * quiescent move the loop drives toward its oldest request.
 */
/** @internal */
export interface RegisteredTestClock extends TestClock {
  readonly stepTowardRequest: () => boolean
}

/** @internal */
export const makeTestClock = (live: KernelClock): RegisteredTestClock => {
  const time = makeVirtualTime()
  const requests: Array<TimeRequest> = []
  const adjust = (duration: Duration.Input): Effect.Effect<void> =>
    Effect.suspend(() =>
      requestMoveTo(requests, time.currentTimeMillisUnsafe() + Duration.toMillis(Duration.fromInputUnsafe(duration)))
    )
  const setTime = (timestamp: number): Effect.Effect<void> => requestMoveTo(requests, timestamp)
  const withLive = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.provideService(effect, Clock.Clock, live)
  return {
    ...clockMembersOf(time),
    adjust,
    setTime,
    withLive,
    stepTowardRequest: () => settleOldest(time, requests),
  }
}

/** The clocks one run owns: the virtual root clock and its registered test clocks. */
/** @internal */
export interface RunClocks {
  readonly clock: KernelClock
  readonly testClocks: Array<RegisteredTestClock>
}

/** @internal */
export const makeRunClocks = (): RunClocks => ({
  clock: makeKernelClock(),
  testClocks: [],
})

/**
 * The quiescence move (R37): settle the oldest test-clock request first, then
 * advance the root clock. False when nothing can move, so the run classifies
 * the stall.
 */
/** @internal */
export const stepClocks = (clocks: RunClocks): boolean =>
  clocks.testClocks.some((testClock) => testClock.stepTowardRequest()) || clocks.clock.advance()

/**
 * Builds the run's test clock and registers it for quiescent settling. Only
 * available inside a kernel run, where the run's clocks live.
 */
/** @internal */
export const kernelTestClock: Effect.Effect<TestClock> = Effect.sync(() => {
  const kernel = currentKernel()
  if (kernel === undefined) {
    throw new Error('effect-sim-kernel: the kernel test clock is only available inside a kernel run')
  }
  const testClock = makeTestClock(kernel.clocks.clock)
  kernel.clocks.testClocks.push(testClock)
  return testClock
})
