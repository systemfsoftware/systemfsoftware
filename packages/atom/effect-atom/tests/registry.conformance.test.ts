import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  Clock,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Match,
  Option,
  Ref,
  Scheduler,
  Schema,
  Scope,
  Stream,
} from 'effect'

import {
  ContextStreamCommand,
  contextStreamModel,
  DerivedCommand,
  derivedModel,
  doubled,
  LifetimeCommand,
  lifetimeModel,
  RegistryCommand,
  registryModel,
  StreamCommand,
  streamModel,
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
  readonly registry: Atom.Registry.Registry
  readonly source: Atom.Writable<number>
  readonly derived: Atom.Atom<number>
}

class Graph
  extends Context.Service<Graph, RegistryGraph>()('@systemfsoftware/effect-atom/tests/registry.conformance.test/Graph')
{}

const freshGraph = (ports: KernelPorts): RegistryGraph => {
  const source = Atom.keepAlive(Atom.make(0))
  const derived = Atom.readable((get) => doubled(get(source)))
  return { registry: Atom.Registry.make(ports), source, derived }
}

const scopedRegistry = <S, H extends { readonly registry: Atom.Registry.Registry }>(
  keeper: Context.Key<S, H>,
  acquire: Effect.Effect<Context.Context<S>, never, never>,
): Effect.Effect<Context.Context<S>, never, Scope.Scope> =>
  Effect.acquireRelease(
    acquire,
    (context) => Effect.sync(() => Atom.Registry.dispose(Context.get(context, keeper).registry)),
  )

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
      GetSource: () => Atom.Registry.get(graph.registry, graph.source),
      GetDerived: () => Atom.Registry.get(graph.registry, graph.derived),
      SetSource: (set) => {
        Atom.Registry.set(graph.registry, graph.source, set.value)
        return undefined
      },
      UpdateSource: (update) => {
        Atom.Registry.update(graph.registry, graph.source, (value) => value + update.by)
        return undefined
      },
      ModifySource: () => Atom.Registry.modify(graph.registry, graph.source, increasedBy),
      RefreshDerived: () => {
        Atom.Registry.refresh(graph.registry, graph.derived)
        return undefined
      },
      Reset: () => {
        Atom.Registry.reset(graph.registry)
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
  readonly registry: Atom.Registry.Registry
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
  const registry = Atom.Registry.make(ports)
  const delivered: Array<number> = []
  return {
    registry,
    source,
    delivered,
    subscribe: () => {
      Atom.Registry.subscribe(registry, source, (value) => {
        delivered.push(value)
      })
      return [...delivered]
    },
    setSource: (value) => {
      Atom.Registry.set(registry, source, value)
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
  readonly registry: Atom.Registry.Registry
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
  const registry = Atom.Registry.make({ ...ports, timeoutResolution: RESOLUTION_MILLIS })
  let release: (() => void) | undefined = undefined
  return {
    registry,
    atom,
    mount: () => {
      release = Atom.Registry.subscribe(registry, atom, () => {}, { immediate: true })
    },
    unmount: () => {
      if (release !== undefined) {
        release()
      }
    },
    observe: () => Option.isSome(Atom.Registry.getRaw(registry, atom)),
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

interface StreamHandle {
  readonly registry: Atom.Registry.Registry
  readonly value: Atom.Writable<number>
}

class Streams extends Context.Service<Streams, StreamHandle>()(
  '@systemfsoftware/effect-atom/tests/registry.conformance.test/Streams',
) {}

const freshStream = (ports: KernelPorts): StreamHandle => ({
  registry: Atom.Registry.make(ports),
  value: Atom.keepAlive(Atom.make(1)),
})

const streamLayer: Layer.Layer<Streams> = Layer.unwrap(
  Effect.map(
    portsFromRun,
    (ports) =>
      Layer.effectContext(scopedRegistry(Streams, Effect.sync(() => Context.make(Streams, freshStream(ports))))),
  ),
)

const readCurrent = (handle: StreamHandle): Effect.Effect<ReadonlyArray<number>> =>
  Effect.scoped(
    Stream.runCollect(Atom.Registry.toStream(handle.registry, handle.value).pipe(Stream.take(1))),
  )

const runStreamCommand = (
  command: StreamCommand,
): Effect.Effect<ReadonlyArray<number> | undefined, never, Streams> =>
  Effect.flatMap(Streams, (handle) =>
    Match.value(command).pipe(
      Match.tagsExhaustive({
        SetSource: (set) =>
          Effect.as(Effect.sync(() => Atom.Registry.set(handle.registry, handle.value, set.value)), undefined),
        ReadCurrent: () => readCurrent(handle),
      }),
    ))

const streamCheck = (
  subject: Layer.Layer<Streams>,
  spec: { readonly sequences: number; readonly operations: number },
) =>
  Conformance.sequential(subject, {
    commands: StreamCommand,
    model: streamModel,
    run: runStreamCommand,
    sequences: spec.sequences,
    operations: spec.operations,
  })

interface ContextStreamHandle {
  readonly registry: Atom.Registry.Registry
  readonly result: Atom.Writable<Atom.AsyncResult.Result<number, never>>
  readonly stream: Atom.Atom<Stream.Stream<number, never>>
}

class ContextStreams extends Context.Service<ContextStreams, ContextStreamHandle>()(
  '@systemfsoftware/effect-atom/tests/registry.conformance.test/ContextStreams',
) {}

const freshContextStream = (ports: KernelPorts): ContextStreamHandle => {
  const result = Atom.keepAlive(Atom.make<Atom.AsyncResult.Result<number, never>>(Atom.AsyncResult.success(3)))
  const stream = Atom.keepAlive(
    Atom.readable((get) => {
      get(result)
      return get.streamResult(result)
    }),
  )
  return { registry: Atom.Registry.make(ports), result, stream }
}

const contextStreamLayer: Layer.Layer<ContextStreams> = Layer.unwrap(
  Effect.map(
    portsFromRun,
    (ports) =>
      Layer.effectContext(
        scopedRegistry(ContextStreams, Effect.sync(() => Context.make(ContextStreams, freshContextStream(ports)))),
      ),
  ),
)

const readSettled = (handle: ContextStreamHandle): Effect.Effect<ReadonlyArray<number>> =>
  Effect.scoped(Stream.runCollect(Atom.Registry.get(handle.registry, handle.stream).pipe(Stream.take(1))))

const runContextStreamCommand = (
  command: ContextStreamCommand,
): Effect.Effect<ReadonlyArray<number> | undefined, never, ContextStreams> =>
  Effect.flatMap(ContextStreams, (handle) =>
    Match.value(command).pipe(
      Match.tagsExhaustive({
        Settle: (settle) =>
          Effect.as(
            Effect.sync(() =>
              Atom.Registry.set(handle.registry, handle.result, Atom.AsyncResult.success(settle.value))
            ),
            undefined,
          ),
        ReadSettled: () => readSettled(handle),
      }),
    ))

const contextStreamCheck = (
  subject: Layer.Layer<ContextStreams>,
  spec: { readonly sequences: number; readonly operations: number },
) =>
  Conformance.sequential(subject, {
    commands: ContextStreamCommand,
    model: contextStreamModel,
    run: runContextStreamCommand,
    sequences: spec.sequences,
    operations: spec.operations,
  })

const listenersOn = <A>(registry: Atom.Registry.Registry, atom: Atom.Atom<A>): number =>
  Atom.Registry.getNodes(registry).get(atom)?.listeners.size ?? 0

const stillSubscribed = <A>(
  captured: Ref.Ref<Option.Option<Atom.Registry.Registry>>,
  atom: Atom.Atom<A>,
  what: string,
): Effect.Effect<void> =>
  Effect.flatMap(Ref.get(captured), (held) =>
    Option.match(held, {
      onNone: () => Effect.void,
      onSome: (registry) =>
        listenersOn(registry, atom) > 0
          ? Effect.die(new Error(`a reader is still subscribed to ${what} after letting go`))
          : Effect.void,
    }))

const streamedOnce = (
  captured: Ref.Ref<Option.Option<Atom.Registry.Registry>>,
  value: Atom.Atom<number>,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const registry = Atom.Registry.make()
    yield* Ref.set(captured, Option.some(registry))
    yield* Effect.scoped(Stream.runDrain(Atom.Registry.toStream(registry, value).pipe(Stream.take(1))))
  })

const mountedOnce = (
  captured: Ref.Ref<Option.Option<Atom.Registry.Registry>>,
  value: Atom.Atom<number>,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const registry = Atom.Registry.make()
    yield* Ref.set(captured, Option.some(registry))
    yield* Effect.scoped(Atom.Registry.mount(registry, value))
  })

class Provided extends Context.Service<Provided, Atom.Registry.Registry>()(
  '@systemfsoftware/effect-atom/tests/registry.conformance.test/Provided',
) {}

const providedOnce = (captured: Ref.Ref<Option.Option<Atom.Registry.Registry>>): Effect.Effect<void> =>
  Effect.provide(
    Effect.gen(function*() {
      const registry = yield* Provided
      yield* Ref.set(captured, Option.some(registry))
    }),
    Atom.Registry.layer(Provided),
  )

const registryDisposed = (captured: Ref.Ref<Option.Option<Atom.Registry.Registry>>): Effect.Effect<void> =>
  Effect.flatMap(Ref.get(captured), (held) =>
    Option.match(held, {
      onNone: () => Effect.void,
      onSome: (registry) =>
        Effect.flatMap(
          Effect.exit(Effect.try(() => Atom.Registry.get(registry, Atom.make(0)))),
          (exit) =>
            Exit.isFailure(exit)
              ? Effect.void
              : Effect.die(new Error('a provided registry still answers after its scope closed')),
        ),
    }))

const runningRun = (
  live: Ref.Ref<number>,
  started: Ref.Ref<number>,
  input: number,
): Effect.Effect<number, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.andThen(
      Ref.update(started, (count) => count + 1),
      Ref.update(live, (count) => count + 1),
    ),
    () => Ref.update(live, (count) => count - 1),
  ).pipe(Effect.andThen(Effect.never), Effect.as(input))

interface RunHandle {
  readonly live: Ref.Ref<number>
  readonly started: Ref.Ref<number>
}

const freshRun = (): RunHandle => ({ live: Ref.makeUnsafe(0), started: Ref.makeUnsafe(0) })

const forkedRuns = (handle: RunHandle): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => Atom.Registry.make()),
    (registry) => Effect.sync(() => Atom.Registry.dispose(registry)),
  ).pipe(
    Effect.flatMap((registry) =>
      Effect.gen(function*() {
        const task = Atom.fn((input: number) => runningRun(handle.live, handle.started, input), { concurrent: true })
        const release = Atom.Registry.subscribe(registry, task, () => {}, { immediate: true })
        yield* Effect.sync(() => {
          Atom.Registry.set(registry, task, 1)
          Atom.Registry.set(registry, task, 2)
          Atom.Registry.set(registry, task, 3)
        })
        yield* Effect.yieldNow
        yield* Effect.sync(() => release())
      })
    ),
  )

const runsReleasedTogether = (handle: RunHandle): Effect.Effect<void> =>
  Effect.gen(function*() {
    const started = yield* Ref.get(handle.started)
    if (started < 1) {
      return yield* Effect.die(new Error('no run ever started, so the release proves nothing'))
    }
    const live = yield* Ref.get(handle.live)
    if (live !== 0) {
      return yield* Effect.die(new Error(`expected no run left running, but ${live} still ran`))
    }
  })

/** The budget the sequential check is given: every one of these histories is checked. */
const SUBSCRIPTION_ROUNDS = 50
const LIFETIME_ROUNDS = 60
const STREAM_ROUNDS = 50
const CONTEXT_STREAM_ROUNDS = 50

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
          Then(`every interleaving matches ${row.writers} taking turns one after the other`)((s, expect) =>
            expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass' })
          ),
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
        Then(
          'the reader only ever shows 0, 2, or 4, and every interleaving matches Ada and Bo taking turns one after the other',
        )(
          (s, expect) => expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass' }),
        ),
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
          (s) => subscriptionCheck(s.subject, { sequences: SUBSCRIPTION_ROUNDS, operations: 8 }),
        ),
        Then('every write is heard exactly once, in the order it happened')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass', histories: SUBSCRIPTION_ROUNDS })
        ),
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
          (s) => lifetimeCheck(s.subject, { sequences: LIFETIME_ROUNDS, operations: 12 }),
        ),
        Then('a released entry is gone once the wait passes, and a held entry is never gone')(
          (s, expect) =>
            expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass', histories: LIFETIME_ROUNDS }),
        ),
      ),
    )

    scenario(
      'A reader that follows a value as a stream starts at the value the registry currently holds',
      Gherkin.Do.pipe(
        Given('a value starting at 1 that a registry holds')(
          'subject',
          () => Effect.succeed(streamLayer),
        ),
        When('fifty rounds of setting the value and reading it as a stream are replayed')(
          'report',
          (s) => streamCheck(s.subject, { sequences: CONTEXT_STREAM_ROUNDS, operations: 10 }),
        ),
        Then('every read starts at the value the registry currently holds')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass', histories: STREAM_ROUNDS })
        ),
      ),
    )

    scenario(
      'A reader that follows a settled result as a stream hears it right away',
      Gherkin.Do.pipe(
        Given('a settled result a registry exposes as a stream')(
          'subject',
          () => Effect.succeed(contextStreamLayer),
        ),
        When('fifty rounds of settling the result and reading the stream are replayed')(
          'report',
          (s) => contextStreamCheck(s.subject, { sequences: STREAM_ROUNDS, operations: 8 }),
        ),
        Then('the reader hears the settled value each time')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({
            _tag: 'Pass',
            histories: CONTEXT_STREAM_ROUNDS,
          })
        ),
      ),
    )

    scenario(
      'A reader that follows a value as a stream stops listening once it lets go',
      Gherkin.Do.pipe(
        Given('a value a registry can stream')('held', () =>
          Effect.map(
            Ref.make(Option.none<Atom.Registry.Registry>()),
            (captured) => ({ captured, value: Atom.keepAlive(Atom.make(1)) }),
          )),
        When('a stream of the value is read and the reader lets go, stopped at each step')(
          'checked',
          (s) =>
            Conformance.released(streamedOnce(s.held.captured, s.held.value), {
              probe: stillSubscribed(s.held.captured, s.held.value, 'a streamed value'),
            }),
        ),
        Then('nobody is left subscribed to the value')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'A value held open for a scope stops being held once the scope closes',
      Gherkin.Do.pipe(
        Given('a value a registry holds')('held', () =>
          Effect.map(
            Ref.make(Option.none<Atom.Registry.Registry>()),
            (captured) => ({ captured, value: Atom.keepAlive(Atom.make(1)) }),
          )),
        When('the value is held open for a scope that is closed at each step')(
          'checked',
          (s) =>
            Conformance.released(mountedOnce(s.held.captured, s.held.value), {
              probe: stillSubscribed(s.held.captured, s.held.value, 'a held value'),
            }),
        ),
        Then('nobody is left subscribed to the value')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'A registry provided for a name is thrown away once its scope closes',
      Gherkin.Do.pipe(
        Given('somewhere to remember a provided registry')(
          'provided',
          () => Effect.map(Ref.make(Option.none<Atom.Registry.Registry>()), (captured) => ({ captured })),
        ),
        When('a registry is provided for a name and its scope is closed at each step')(
          'checked',
          (s) =>
            Conformance.released(providedOnce(s.provided.captured), {
              probe: registryDisposed(s.provided.captured),
            }),
        ),
        Then('the provided registry no longer answers')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'A computation still running when its owner lets go is left with nothing running',
      Gherkin.Do.pipe(
        Given('counters for runs that are running and runs that have started')('runs', () => Effect.sync(freshRun)),
        When('the computation is asked to run three times at once and then let go, stopped at each step')(
          'checked',
          (s) => Conformance.released(forkedRuns(s.runs), { probe: runsReleasedTogether(s.runs) }),
        ),
        Then(
          'nothing is left running once the owner lets go, and at least one run started so the release proves something',
        )(
          (s, expect) =>
            Effect.map(
              Ref.get(s.runs.started),
              (started) =>
                expect({ report: s.checked, started }, Conformance.render(s.checked)).toMatchObject({
                  report: { _tag: 'Pass' },
                  started: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
                }),
            ),
        ),
      ),
    )
  })
