import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom, Registry } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
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

class Graph extends Context.Service<Graph, RegistryGraph>()('@systemfsoftware/effect-atom/tests/RegistryGraph') {}

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

const registryCheck = (spec: { readonly fibers: number; readonly operations: number }) =>
  Conformance.linearizable(graphLayer, {
    commands: RegistryCommand,
    model: registryModel,
    run: runRegistryCommand,
    fibers: spec.fibers,
    operations: spec.operations,
    preemptions: 1,
    maxSchedules: 2000,
  })

const derivedCheck = (spec: { readonly fibers: number; readonly operations: number }) =>
  Conformance.linearizable(graphLayer, {
    commands: DerivedCommand,
    model: derivedModel,
    run: runRegistryCommand,
    fibers: spec.fibers,
    operations: spec.operations,
    preemptions: 1,
    maxSchedules: 2000,
  })

interface SubscriptionHandle {
  readonly registry: Registry.Registry
  readonly source: Atom.Writable<number>
  readonly delivered: Array<number>
  readonly subscribe: () => ReadonlyArray<number>
  readonly setSource: (value: number) => ReadonlyArray<number>
}

class Subscriptions extends Context.Service<Subscriptions, SubscriptionHandle>()(
  '@systemfsoftware/effect-atom/tests/Subscriptions',
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

const subscriptionCheck = (spec: { readonly sequences: number; readonly operations: number }) =>
  Conformance.sequential(subscriptionLayer, {
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

class Lifetimes extends Context.Service<Lifetimes, LifetimeHandle>()('@systemfsoftware/effect-atom/tests/Lifetimes') {}

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
const lifetimeCheck = (spec: { readonly sequences: number; readonly operations: number }) =>
  Conformance.sequential(lifetimeLayer, {
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

Feature('A registry that behaves like its model under concurrent readers and writers')
  .live('the scenario drives its own simulation-kernel run, and a conformance check cannot run inside one')
  .body(({ scenario }) => {
    scenario(
      'Two callers reading and writing keep every schedule with the model',
      Gherkin.Do.pipe(
        Given('a registry built on the run that steps it, with a source and a doubled reader')(
          'checked',
          () => registryCheck({ fibers: 2, operations: 4 }),
        ),
        Then('every explored schedule matches some sequential order of the model')((s) => {
          passHistories(s.checked)
        }),
      ),
    )

    scenario(
      'Three callers reading and writing keep every schedule with the model',
      Gherkin.Do.pipe(
        Given('a registry built on the run that steps it, shared across one more caller')(
          'checked',
          () => registryCheck({ fibers: 3, operations: 3 }),
        ),
        Then('every explored schedule matches some sequential order of the model')((s) => {
          passHistories(s.checked)
        }),
      ),
    )

    scenario(
      'Two callers reading a doubling reader while another overwrites the source',
      Gherkin.Do.pipe(
        Given('a doubled reader read beside a writer')('checked', () => derivedCheck({ fibers: 2, operations: 4 })),
        Then('every doubling observation is either the old doubled value or the new doubled one')((s) => {
          passHistories(s.checked)
        }),
      ),
    )

    scenario(
      'A listener subscribed before a write hears the write exactly once',
      Gherkin.Do.pipe(
        Given('a listener registered ahead of the writes it hears')(
          'checked',
          () => subscriptionCheck({ sequences: 50, operations: 8 }),
        ),
        Then('every write is heard exactly once, in the order it happened')((s) => {
          passHistories(s.checked)
        }),
      ),
    )

    scenario(
      'An unmounted entry with an idle deadline leaves the registry once the deadline passes',
      Gherkin.Do.pipe(
        Given('a mounted entry released before its idle deadline')(
          'checked',
          () => lifetimeCheck({ sequences: 60, operations: 12 }),
        ),
        Then('the released entry is gone after the deadline, and a held entry never leaves')((s) => {
          passHistories(s.checked)
        }),
      ),
    )
  })
