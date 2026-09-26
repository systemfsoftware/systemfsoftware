import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Duration, Effect, Fiber, Option, Scheduler } from 'effect'
import type * as Scope from 'effect/Scope'

const Feature = makeFeature({ it })

/** Short enough that the idle sweep is scheduled inside the run that is cut. */
const IDLE_TTL = '25 millis'

interface TimerLedger {
  scheduled: number
  cancelled: number
}

interface AtomBox {
  readonly ledger: TimerLedger
  readonly listeners: number
  readonly refused: boolean
  readonly value: Option.Option<number>
}

interface AtomWorld {
  box: AtomBox | undefined
}

const atomWorld = (): AtomWorld => ({ box: undefined })

const cancelledTask = (): void => {}

const sleptTask = (clock: Clock.Clock, task: () => void, delayMillis: number) =>
  Effect.provideService(Effect.andThen(Effect.sleep(delayMillis), Effect.sync(task)), Clock.Clock, clock)

const timerFor =
  (clock: Clock.Clock, scheduler: Scheduler.Scheduler, ledger: TimerLedger) =>
  (task: () => void, delayMillis: number): () => void => {
    ledger.scheduled += 1
    const fiber = Effect.runFork(sleptTask(clock, task, delayMillis), { scheduler })
    return () => {
      ledger.cancelled += 1
      Effect.runFork(Fiber.interrupt(fiber), { scheduler })
    }
  }

/** Kernel-driven ports that count every idle timer the registry schedules and cancels. */
const countingPorts = (ledger: TimerLedger) =>
  Effect.gen(function*() {
    const clock = yield* Clock.Clock
    const scheduler = yield* Scheduler.Scheduler
    const dispatcher = scheduler.makeDispatcher()
    return {
      now: () => clock.currentTimeMillisUnsafe(),
      scheduleTask: (task: () => void) => {
        dispatcher.scheduleTask(task, 0)
        return cancelledTask
      },
      scheduleTimer: timerFor(clock, scheduler, ledger),
    }
  })

const listenersOn = (registry: Atom.Registry.Registry, atom: Atom.Atom<number>): number =>
  Atom.Registry.getNodes(registry).get(atom)?.listeners.size ?? 0

const refusedAfterDispose = (registry: Atom.Registry.Registry, atom: Atom.Atom<number>): boolean => {
  try {
    Atom.Registry.refresh(registry, atom)
    return false
  } catch {
    return true
  }
}

const atomProgram = (world: AtomWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const ledger: TimerLedger = { scheduled: 0, cancelled: 0 }
    const registry = Atom.Registry.make(yield* countingPorts(ledger))
    const atom = Atom.setIdleTTL(IDLE_TTL)(Atom.readable(() => 0))
    yield* Effect.scoped(
      Effect.gen(function*() {
        yield* Effect.addFinalizer(() => Effect.sync(() => Atom.Registry.dispose(registry)))
        const release = Atom.Registry.subscribe(registry, atom, () => {}, { immediate: true })
        yield* Effect.sync(() => Atom.Registry.refresh(registry, atom))
        yield* Effect.yieldNow
        yield* Effect.sync(release)
        yield* Effect.yieldNow
        yield* Effect.yieldNow
      }),
    )
    world.box = {
      ledger,
      listeners: listenersOn(registry, atom),
      refused: refusedAfterDispose(registry, atom),
      value: Atom.Registry.getRaw(registry, atom),
    }
  })

const broke = (message: string): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.fail(new Conformance.RuleBroken({ message }))

const atomRule = (world: AtomWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    const box = world.box
    if (box === undefined) {
      return yield* broke('no run of the atom was observed')
    }
    if (box.ledger.scheduled < 1) {
      return yield* broke('the atom scheduled no idle timer, so the disposal proves nothing')
    }
    if (box.ledger.cancelled < box.ledger.scheduled) {
      return yield* broke(`${box.ledger.scheduled - box.ledger.cancelled} idle timer(s) survived the disposal`)
    }
    if (box.listeners !== 0) {
      return yield* broke(`${box.listeners} subscription(s) survived the disposal`)
    }
    if (!box.refused) {
      return yield* broke('an update landed after the registry was disposed')
    }
    if (Option.isSome(box.value)) {
      return yield* broke('the atom value survived the disposal')
    }
    return undefined
  })

Feature('An atom stops when the registry that holds it is disposed', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A disposed-mid-refresh atom leaves no timer, subscription, or update behind',
      Gherkin.Do.pipe(
        Given('a fresh world an atom run can record its disposal into')('world', () => Effect.succeed(atomWorld)),
        When('the registry is disposed while the atom is subscribed and refreshed, at every step')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Atom.readable,
              world: Effect.sync(s.world),
              program: atomProgram,
              restart: atomProgram,
              rule: atomRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('no timer or subscription survives and the disposed registry refuses further updates')(
          (s, expect) =>
            expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
              report: { _tag: 'Pass' },
            }),
        ),
      ),
    )
  })
