/**
 * Host clock and timer primitives for the atom registry.
 *
 * This module is the named host boundary for wall-clock reads and delayed
 * scheduling. The registry itself is a fiber-free store, and consumers who
 * need deterministic idle eviction pass their own `now` / `scheduleTimer` to
 * `Registry.make` / `Registry.layer`.
 *
 * The defaults take the clock and the scheduler from the Effect fiber that is
 * running when the registry is built, once, and keep them for the registry's
 * lifetime: registry work runs later from queued tasks and timer callbacks,
 * where no fiber is current. A scenario on the simulation kernel supplies its
 * own `Scheduler` and `Clock`, so a registry that configures nothing still
 * routes every timer and queued task through the run it was built in. A
 * registry built outside any fiber — at module scope or on the platform —
 * falls back to the Effect-native primitives: the default `Clock` reference's
 * wall clock, and `Effect.sleep` forked on the default runtime, so this
 * boundary never reaches for the `Date` or timer globals directly.
 *
 * @since 4.0.0
 */
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import * as Scheduler from 'effect/Scheduler'

/** @internal */
export interface HostPorts {
  readonly now: () => number
  /** `undefined` outside a run, so `MixedScheduler` keeps its own host dispatch. */
  readonly scheduleTask: ((f: () => void) => () => void) | undefined
  readonly scheduleTimer: (f: () => void, delayMillis: number) => () => void
}

const cancelledTask = (): void => {}

const serviceOf = <I, S>(context: Context.Context<never> | undefined, key: Context.Key<I, S>): S | undefined =>
  context === undefined ? undefined : Option.getOrUndefined(Context.getOption(context, key))

const currentContext = (): Context.Context<never> | undefined => Fiber.getCurrent()?.context

const clockOf = (context: Context.Context<never> | undefined): Clock.Clock =>
  serviceOf(context, Clock.Clock) ?? Clock.Clock.defaultValue()

const taskOn = (scheduler: Scheduler.Scheduler | undefined): HostPorts['scheduleTask'] => {
  if (scheduler === undefined) {
    return undefined
  }
  const dispatcher = scheduler.makeDispatcher()
  return (f) => {
    dispatcher.scheduleTask(f, 0)
    return cancelledTask
  }
}

const forkOn = (effect: Effect.Effect<void>, scheduler: Scheduler.Scheduler | undefined): Fiber.Fiber<void> =>
  scheduler === undefined ? Effect.runFork(effect) : Effect.runFork(effect, { scheduler })

const timerOn =
  (clock: Clock.Clock, scheduler: Scheduler.Scheduler | undefined): HostPorts['scheduleTimer'] => (f, delayMillis) => {
    const fiber = forkOn(
      Effect.provideService(Effect.andThen(Effect.sleep(delayMillis), Effect.sync(f)), Clock.Clock, clock),
      scheduler,
    )
    return () => {
      forkOn(Fiber.interrupt(fiber), scheduler)
    }
  }

/**
 * The clock, task dispatcher, and timer of the fiber running now, resolved
 * once; outside any fiber, the default clock and runtime.
 *
 * @internal
 */
export const hostPorts = (): HostPorts => {
  const context = currentContext()
  const clock = clockOf(context)
  const scheduler = serviceOf(context, Scheduler.Scheduler)
  return {
    now: () => clock.currentTimeMillisUnsafe(),
    scheduleTask: taskOn(scheduler),
    scheduleTimer: timerOn(clock, scheduler),
  }
}
