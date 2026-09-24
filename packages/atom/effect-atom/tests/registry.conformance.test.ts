import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom, Registry } from '@systemfsoftware/effect-atom'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Context, Effect, Fiber, Layer, Match, Option, Scheduler, Scope } from 'effect'

import {
  DerivedCommand,
  derivedModel,
  doubled,
  LifetimeCommand,
  lifetimeModel,
  RegistryCommand,
  registryModel,
  SubscriptionCommand,
  subscriptionModel,
} from './__fixtures__/registry.model.js'

const Feature = makeFeature({ it })

interface KernelPorts {
  readonly now: () => number
  readonly scheduleTask: (task: () => void) => () => void
  readonly scheduleTimer: (task: () => void, delayMillis: number) => () => void
}

const cancelledTask = (): void => {}

const sleptTask = (clock: Clock.Clock, task: () => void, delayMillis: number) =>
  Effect.provideService(
    Effect.andThen(Effect.sleep(delayMillis), Effect.sync(task)),
    Clock.Clock,
    clock,
  )

const timerFor = (
  clock: Clock.Clock,
  scheduler: Scheduler.Scheduler,
  task: () => void,
  delayMillis: number,
): () => void => {
  const fiber = Effect.runFork(sleptTask(clock, task, delayMillis), { scheduler })
  return () => {
    Effect.runFork(Fiber.interrupt(fiber), { scheduler })
  }
}

const kernelPorts = (clock: Clock.Clock, scheduler: Scheduler.Scheduler): KernelPorts => {
  const dispatcher = scheduler.makeDispatcher()
  return {
    now: () => clock.currentTimeMillisUnsafe(),
    scheduleTask: (task) => {
      dispatcher.scheduleTask(task, 0)
      return cancelledTask
    },
    scheduleTimer: (task, delayMillis) => timerFor(clock, scheduler, task, delayMillis),
  }
}

const portsFromRun = Effect.gen(function*() {
  const clock = yield* Clock.Clock
  const scheduler = yield* Scheduler.Scheduler
  return kernelPorts(clock, scheduler)
})

interface RegistryGraph {
  readonly registry: Registry.Registry
  readonly source: Atom.Writable<number>
  readonly derived: Atom.Atom<number>
}

class Graph
  extends Context.Service<Graph, RegistryGraph>()('@systemfsoftware/effect-atom/tests/registry.conformance.test/Graph')
{}

const freshGraph = (ports: KernelPorts): RegistryGraph => {
  const source = Atom.keepAlive(Atom.make(0))
  const derived = Atom.readable((get) => doubled(get(source)))
  return { registry: Registry.make(ports), source, derived }
}

const scopedRegistry = <S, H extends { readonly registry: Registry.Registry }>(
  keeper: Context.Key<S, H>,
  acquire: Effect.Effect<Context.Context<S>, never, never>,
): Effect.Effect<Context.Context<S>, never, Scope.Scope> =>
  Effect.acquireRelease(acquire, (context) => Effect.sync(() => Context.get(context, keeper).registry.dispose()))

const graphLayer: Layer.Layer<Graph> = Layer.unwrap(
  Effect.map(
    portsFromRun,
    (ports) => Layer.effectContext(scopedRegistry(Graph, Effect.sync(() => Context.make(Graph, freshGraph(ports))))),
  ),
)

const increasedBy = (value: number): [number, number] => [value, value + 1]

const writtenThrough = (graph: RegistryGraph, command: RegistryCommand): number | undefined =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      GetSource: () => graph.registry.get(graph.source),
      GetDerived: () => graph.registry.get(graph.derived),
      SetSource: (set) => {
        graph.registry.set(graph.source, set.value)
        return undefined
      },
      UpdateSource: (update) => {
        graph.registry.update(graph.source, (value) => value + update.by)
        return undefined
      },
      ModifySource: () => graph.registry.modify(graph.source, increasedBy),
      RefreshDerived: () => {
        graph.registry.refresh(graph.derived)
        return undefined
      },
      Reset: () => {
        graph.registry.reset()
        return undefined
      },
    }),
  )

const runRegistryCommand = (command: RegistryCommand): Effect.Effect<number | undefined, never, Graph> =>
  Effect.flatMap(Graph, (graph) => Effect.sync(() => writtenThrough(graph, command)))

const CONCURRENCY_BOUND = {
  preemptions: 2,
  maxSchedules: 200_000,
} as const

const registryCheck = (
  subject: Layer.Layer<Graph>,
  spec: { readonly fibers: number; readonly operations: number },
) =>
  Conformance.linearizable(subject, {
    commands: RegistryCommand,
    model: registryModel,
    run: runRegistryCommand,
    fibers: spec.fibers,
    operations: spec.operations,
    ...CONCURRENCY_BOUND,
  })

const derivedCheck = (
  subject: Layer.Layer<Graph>,
  spec: { readonly fibers: number; readonly operations: number },
) =>
  Conformance.linearizable(subject, {
    commands: DerivedCommand,
    model: derivedModel,
    run: runRegistryCommand,
    fibers: spec.fibers,
    operations: spec.operations,
    ...CONCURRENCY_BOUND,
  })

interface SubscriptionHandle {
  readonly registry: Registry.Registry
  readonly source: Atom.Writable<number>
  readonly delivered: Array<number>
  readonly subscribe: () => ReadonlyArray<number>
  readonly setSource: (value: number) => ReadonlyArray<number>
}

class Subscriptions extends Context.Service<Subscriptions, SubscriptionHandle>()(
  '@systemfsoftware/effect-atom/tests/registry.conformance.test/Subscriptions',
) {}

const freshSubscription = (ports: KernelPorts): SubscriptionHandle => {
  const source = Atom.make(0)
  const registry = Registry.make(ports)
  const delivered: Array<number> = []
  return {
    registry,
    source,
    delivered,
    subscribe: () => {
      registry.subscribe(source, (value) => {
        delivered.push(value)
      })
      return [...delivered]
    },
    setSource: (value) => {
      registry.set(source, value)
      return [...delivered]
    },
  }
}

const subscriptionLayer: Layer.Layer<Subscriptions> = Layer.unwrap(
  Effect.map(
    portsFromRun,
    (ports) =>
      Layer.effectContext(
        scopedRegistry(Subscriptions, Effect.sync(() => Context.make(Subscriptions, freshSubscription(ports)))),
      ),
  ),
)

const notifiedThrough = (handle: SubscriptionHandle, command: SubscriptionCommand): ReadonlyArray<number> =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      Subscribe: () => handle.subscribe(),
      SetSource: (set) => handle.setSource(set.value),
    }),
  )

const runSubscriptionCommand = (
  command: SubscriptionCommand,
): Effect.Effect<ReadonlyArray<number>, never, Subscriptions> =>
  Effect.flatMap(Subscriptions, (handle) => Effect.sync(() => notifiedThrough(handle, command)))

const subscriptionCheck = (
  subject: Layer.Layer<Subscriptions>,
  spec: { readonly sequences: number; readonly operations: number },
) =>
  Conformance.sequential(subject, {
    commands: SubscriptionCommand,
    model: subscriptionModel,
    run: runSubscriptionCommand,
    sequences: spec.sequences,
    operations: spec.operations,
  })

interface LifetimeHandle {
  readonly registry: Registry.Registry
  readonly atom: Atom.Atom<number>
  readonly mount: () => void
  readonly unmount: () => void
  readonly observe: () => boolean
}

class Lifetimes extends Context.Service<Lifetimes, LifetimeHandle>()(
  '@systemfsoftware/effect-atom/tests/registry.conformance.test/Lifetimes',
) {}

const IDLE_MILLIS = 10
const RESOLUTION_MILLIS = 10
const DEADLINE_MILLIS = 1000

const freshLifetime = (ports: KernelPorts): LifetimeHandle => {
  const atom = Atom.setIdleTTL(IDLE_MILLIS)(Atom.make(0))
  const registry = Registry.make({ ...ports, timeoutResolution: RESOLUTION_MILLIS })
  let release: (() => void) | undefined = undefined
  return {
    registry,
    atom,
    mount: () => {
      release = registry.mount(atom)
    },
    unmount: () => {
      if (release !== undefined) {
        release()
      }
    },
    observe: () => Option.isSome(registry.getRaw(atom)),
  }
}

const lifetimeLayer: Layer.Layer<Lifetimes> = Layer.unwrap(
  Effect.map(
    portsFromRun,
    (ports) =>
      Layer.effectContext(
        scopedRegistry(Lifetimes, Effect.sync(() => Context.make(Lifetimes, freshLifetime(ports)))),
      ),
  ),
)

const livedThrough = (
  handle: LifetimeHandle,
  command: LifetimeCommand,
): Effect.Effect<void | boolean, never, never> =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      Mount: () => Effect.sync(() => handle.mount()),
      Unmount: () => Effect.sync(() => handle.unmount()),
      AwaitDeadline: () => Effect.sleep(DEADLINE_MILLIS),
      Observe: () => Effect.sync(() => handle.observe()),
    }),
  )

const runLifetimeCommand = (
  command: LifetimeCommand,
): Effect.Effect<void | boolean, never, Lifetimes> =>
  Effect.flatMap(Lifetimes, (handle) => livedThrough(handle, command))
const lifetimeCheck = (
  subject: Layer.Layer<Lifetimes>,
  spec: { readonly sequences: number; readonly operations: number },
) =>
  Conformance.sequential(subject, {
    commands: LifetimeCommand,
    model: lifetimeModel,
    run: runLifetimeCommand,
    sequences: spec.sequences,
    operations: spec.operations,
  })

const passHistories = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new Error(`expected the check to pass, but it read: ${Conformance.render(report)}`)
    }),
  )

Feature('A registry that keeps readers, writers, listeners, and idle entries consistent', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      '<writers> reading and writing one counter always match them taking turns one after the other',
      [
        { callers: 2, operations: 4, writers: 'Ada and Bo' },
        { callers: 3, operations: 1, writers: 'Ada, Bo, and Cy' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a counter starting at 0 and a reader showing double the counter')(
            'subject',
            () => Effect.succeed(graphLayer),
          ),
          When(`${row.writers} read the counter and write new values`)(
            'report',
            (s) => registryCheck(s.subject, { fibers: row.callers, operations: row.operations }),
          ),
          Then(`every interleaving matches ${row.writers} taking turns one after the other`)((s) => {
            passHistories(s.report)
          }),
        ),
    )

    scenario(
      'A doubling reader only ever shows 0, 2, or 4 while Ada and Bo write',
      Gherkin.Do.pipe(
        Given('a counter starting at 0 and a reader showing double the counter')(
          'subject',
          () => Effect.succeed(graphLayer),
        ),
        When('Ada writes 1 and Bo writes 2 while the doubled counter is read')(
          'report',
          (s) => derivedCheck(s.subject, { fibers: 2, operations: 2 }),
        ),
        Then('the reader only ever shows 0, 2, or 4')((s) => {
          passHistories(s.report)
        }),
        And('every interleaving matches Ada and Bo taking turns one after the other')((s) => {
          passHistories(s.report)
        }),
      ),
    )

    scenario(
      'A listener subscribed before a write hears the write exactly once',
      Gherkin.Do.pipe(
        Given('a counter starting at 0 with a listener ready to subscribe')(
          'subject',
          () => Effect.succeed(subscriptionLayer),
        ),
        When('the listener subscribes and fifty rounds of writes arrive')(
          'report',
          (s) => subscriptionCheck(s.subject, { sequences: 50, operations: 8 }),
        ),
        Then('every write is heard exactly once, in the order it happened')((s) => {
          passHistories(s.report)
        }),
      ),
    )

    scenario(
      'An entry kept for a while after its last reader leaves is gone once the wait passes',
      Gherkin.Do.pipe(
        Given('an entry mounted with a reader holding it')(
          'subject',
          () => Effect.succeed(lifetimeLayer),
        ),
        When(
          'sixty rounds of mounting, letting the reader leave, waiting past the keep-alive, and checking the entry are run',
        )(
          'report',
          (s) => lifetimeCheck(s.subject, { sequences: 60, operations: 12 }),
        ),
        Then('a released entry is gone once the wait passes')((s) => {
          passHistories(s.report)
        }),
        And('a held entry is never gone')((s) => {
          passHistories(s.report)
        }),
      ),
    )
  })
