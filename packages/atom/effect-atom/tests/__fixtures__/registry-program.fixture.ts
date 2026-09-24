import { Atom } from '@systemfsoftware/effect-atom'
import { Array as Arr, Data, Effect, Match, Order } from 'effect'
import * as fc from 'fast-check'

/**
 * One step of a program run against a registry holding a counter `c`, three
 * values derived from it (`c`, `2c`, `3c`, and `3c` when `c` is odd else `-1`),
 * a synchronous effect atom plus a `keepAlive` twin whose reads re-run and
 * report a run count, and a mirror writable a listener can copy heard values
 * into. `watched` picks one of those seven by position.
 *
 * `Advance` is only ever generated far past the idle TTL plus its resolution
 * (`advanceMillis`), so the registry either forgets an unheld value entirely or
 * keeps it; no step ever lands inside the eviction window.
 */
export type Step = Data.TaggedEnum<{
  Set: { readonly value: number }
  Increment: {}
  Read: { readonly watched: number }
  Subscribe: { readonly watched: number; readonly writer: boolean; readonly immediate: boolean }
  Unsubscribe: { readonly subscription: number }
  Batch: { readonly steps: ReadonlyArray<Step> }
  Refresh: { readonly watched: number }
  Modify: { readonly value: number }
  Mount: { readonly watched: number }
  Unmount: {}
  Advance: { readonly millis: number }
  Dispose: {}
}>

const Step = Data.taggedEnum<Step>()

const counterValue = fc.integer({ min: -3, max: 3 })
const derivedWatched = fc.integer({ min: 0, max: 3 })
const anyWatched = fc.integer({ min: 0, max: 6 })
const mountWatched = fc.integer({ min: 0, max: 5 })
const subscriptionId = fc.integer({ min: 0, max: 5 })

const counterAtom = 0
const effectAtom = 4
const keepEffectAtom = 5
const mirrorAtom = 6
const atomCount = 7
const atomIndices: ReadonlyArray<number> = Array.from({ length: atomCount }, (_, atom) => atom)

/** The registry under test evicts idle nodes this long after their last use... */
const idleTTL = 30
/** ...rounded onto buckets of this resolution. */
const resolution = 10
/** Every generated `Advance` is far past `idleTTL + resolution`. */
const advanceMillis = 100

const nonEffectWatched = fc.oneof(derivedWatched, fc.constant(mirrorAtom))
const sharedWriterTarget = counterAtom
const subscribeStep: fc.Arbitrary<Step> = fc.tuple(nonEffectWatched, fc.boolean(), fc.boolean()).chain(
  ([watched, writer, immediate]) =>
    fc.constant(Step.Subscribe({ watched: writer ? sharedWriterTarget : watched, writer, immediate })),
)

const leafStep: fc.Arbitrary<Step> = fc.oneof(
  counterValue.map((value) => Step.Set({ value })),
  fc.constant(Step.Increment()),
  anyWatched.map((watched) => Step.Read({ watched })),
  counterValue.map((value) => Step.Modify({ value })),
  subscriptionId.map((subscription) => Step.Unsubscribe({ subscription })),
  mountWatched.map((watched) => Step.Refresh({ watched })),
)

/**
 * A batch holds batch-safe steps and may nest one more batch inside itself.
 * Subscribing is not batch-safe: a listener attached while a batch is open is
 * not what the notification rules are about.
 */
const batchStep: fc.Arbitrary<Step> = fc.oneof(
  fc.array(leafStep, { maxLength: 3 }).map((steps) => Step.Batch({ steps })),
  fc.array(leafStep, { maxLength: 2 }).chain((inner) =>
    fc.array(leafStep, { maxLength: 2 }).map((outer) => Step.Batch({ steps: [...outer, Step.Batch({ steps: inner })] }))
  ),
)

const step: fc.Arbitrary<Step> = fc.oneof(
  { arbitrary: leafStep, weight: 8 },
  { arbitrary: subscribeStep, weight: 8 },
  { arbitrary: batchStep, weight: 6 },
  { arbitrary: mountWatched.map((watched) => Step.Mount({ watched })), weight: 3 },
  { arbitrary: fc.constant(Step.Unmount()), weight: 3 },
  { arbitrary: fc.constant(Step.Advance({ millis: advanceMillis })), weight: 5 },
  { arbitrary: fc.constant(Step.Dispose()), weight: 1 },
)

export const programs: fc.Arbitrary<ReadonlyArray<Step>> = fc.array(step, { maxLength: 25 })

/** A batch holds other steps; `unbatched` flattens one into separate top-level steps. */
const isBatch = (current: Step): current is Step & { readonly _tag: 'Batch' } =>
  Match.value(current).pipe(
    Match.tag('Batch', () => true),
    Match.orElse(() => false),
  )
/** Flattens every batch into separate top-level steps: the same program, unbatched. */
export const unbatched = (program: ReadonlyArray<Step>): ReadonlyArray<Step> =>
  program.flatMap((current) => (isBatch(current) ? unbatched(current.steps) : [current]))

// -----------------------------------------------------------------------------
// what the atoms are
// -----------------------------------------------------------------------------

/** Counter, `2c`, `3c`, odd-only `3c`, effect, keepAlive effect, mirror. */
const derive = (counter: number): readonly [number, number, number, number] => [
  counter,
  counter * 2,
  counter * 3,
  Math.abs(counter % 2) === 1 ? counter * 3 : -1,
]

/** The atoms each value reads while it is built; the counter and mirror read nothing. */
const parentsOf: ReadonlyArray<ReadonlyArray<number>> = [
  [],
  [counterAtom],
  [1],
  [counterAtom, 2],
  [counterAtom],
  [counterAtom],
  [],
]

const isKeepAlive = (atom: number): boolean => atom === keepEffectAtom

const derivedAt = (counter: number, watched: number): number => derive(counter)[watched] ?? Number.NaN

// -----------------------------------------------------------------------------
// the model: only what a consumer can observe
// -----------------------------------------------------------------------------

interface Listener {
  readonly kind: 'listener'
  readonly watched: number
  readonly writer: boolean
  readonly lastHeard: number
}
interface MountSlot {
  readonly kind: 'mount'
  readonly watched: number
}
type Slot = Listener | MountSlot

/**
 * Every field is something a consumer can see: the two values a read returns
 * directly, the subscription table that decides what each listener hears and in
 * what order, the batch depth that defers notification, the registry's disposal
 * and the log the differential compares.
 */
interface ModelState {
  /** The counter's value; a writable nobody holds restarts at its definition. */
  readonly counter: number
  readonly mirror: number
  readonly materialized: ReadonlyArray<boolean>
  /** Subscription slots, addressed by the id a `heard` line names. */
  readonly slots: ReadonlyArray<Slot | undefined>
  /** The slots `Unmount` releases, most recent last. */
  readonly mountSlots: ReadonlyArray<number>
  readonly depth: number
  readonly disposed: boolean
  /** Per effect atom: writes that moved its source, refreshes of it, and idle times that forgot it. */
  readonly invalidations: readonly [number, number]
  readonly log: ReadonlyArray<string>
}

const initial: ModelState = {
  counter: 0,
  mirror: 0,
  materialized: Array.from({ length: atomCount }, () => false),
  slots: [],
  mountSlots: [],
  depth: 0,
  invalidations: [0, 0],
  disposed: false,
  log: [],
}

const logLine = (state: ModelState, line: string): ModelState => ({ ...state, log: [...state.log, line] })

const watchedValue = (state: ModelState, watched: number): number =>
  watched === mirrorAtom ? state.mirror : derivedAt(state.counter, watched)

const slotHolds = (state: ModelState, atom: number): boolean =>
  state.slots.some((slot) => slot !== undefined && slot.watched === atom)

/** Reading a value computes it and everything it reads. */
const materializedWith = (state: ModelState, atom: number): ModelState => {
  const materialized = [...state.materialized]
  const visit = (current: number): void => {
    if (materialized[current] === true) {
      return
    }
    materialized[current] = true
    for (const parent of parentsOf[current] ?? []) {
      visit(parent)
    }
  }
  visit(atom)
  return materialized.every((isMaterialized, at) => isMaterialized === state.materialized[at])
    ? state
    : { ...state, materialized }
}

/** A held node keeps the nodes it reads alive: a live dependent pins its parents. */
const closeUnderParents = (state: ModelState, held: ReadonlyArray<boolean>): ReadonlyArray<boolean> => {
  const stepped = held.map((isHeld, atom) =>
    isHeld ||
    (state.materialized[atom] === true &&
      parentsOf.some((parents, child) => held[child] === true && parents.includes(atom)))
  )
  return stepped.every((isHeld, atom) => isHeld === held[atom])
    ? stepped
    : closeUnderParents(state, stepped)
}

const heldAtoms = (state: ModelState): ReadonlyArray<boolean> =>
  closeUnderParents(
    state,
    atomIndices.map((atom) => state.materialized[atom] === true && (isKeepAlive(atom) || slotHolds(state, atom))),
  )

/** One write into the mirror, and the mirror's own listeners hear the copy once. */
const writeMirror = (state: ModelState, value: number, lines: Array<string>): ModelState => {
  if (state.mirror === value) {
    return state
  }
  const slots = [...state.slots]
  slots.forEach((slot, id) => {
    if (slot === undefined || slot.kind !== 'listener' || slot.watched !== mirrorAtom) {
      return
    }
    if (slot.lastHeard === value) {
      return
    }
    slots[id] = { ...slot, lastHeard: value }
    lines.push(`heard ${id}: ${value}`)
  })
  return { ...state, mirror: value, slots }
}

/**
 * Each listener hears the change of the value it watches, once, in subscription
 * order; a listener that copies what it hears into the mirror pulls the
 * mirror's own listeners in with it.
 */
const hear = (state: ModelState): ModelState => {
  const lines: Array<string> = []
  let current: ModelState = state
  for (const id of current.slots.keys()) {
    const slot = current.slots[id]
    if (slot === undefined || slot.kind !== 'listener') {
      continue
    }
    const heard = watchedValue(current, slot.watched)
    if (heard === slot.lastHeard) {
      continue
    }
    current = {
      ...current,
      slots: current.slots.map((entry, at) =>
        at === id && entry !== undefined && entry.kind === 'listener' ? { ...entry, lastHeard: heard } : entry
      ),
    }
    if (slot.writer) {
      current = writeMirror(current, heard, lines)
      continue
    }
    lines.push(`heard ${id}: ${heard}`)
  }
  return { ...current, log: [...current.log, ...lines] }
}
const setCounter = (state: ModelState, value: number): ModelState => {
  const touched = materializedWith(state, counterAtom)
  if (value === touched.counter) {
    return touched
  }
  const [effect, keepEffect] = touched.invalidations
  const written = { ...touched, counter: value, invalidations: [effect + 1, keepEffect + 1] as const }
  return state.depth > 0 ? written : hear(written)
}

const readCaption = (target: ModelState, watched: number): string =>
  watched === effectAtom || watched === keepEffectAtom
    ? `read ${watched}: success(${target.counter})`
    : `read ${watched}: ${watchedValue(target, watched)}`
const readStep = (state: ModelState, watched: number): ModelState => {
  const touched = materializedWith(state, watched)
  return logLine(touched, readCaption(touched, watched))
}
const subscribeStepModel = (
  state: ModelState,
  watched: number,
  writer: boolean,
  immediate: boolean,
): ModelState => {
  const id = state.slots.length
  const value = watchedValue(state, watched)
  const touched = materializedWith(state, watched)
  const attached: ModelState = {
    ...touched,
    slots: [...touched.slots, { kind: 'listener', watched, writer, lastHeard: value }],
  }
  if (immediate === false) {
    return attached
  }
  if (writer) {
    const lines: Array<string> = []
    const copied = writeMirror(attached, value, lines)
    return { ...copied, log: [...copied.log, ...lines] }
  }
  return logLine(attached, `heard ${id}: ${value}`)
}

const unsubscribeStep = (state: ModelState, subscription: number): ModelState => {
  if (state.slots[subscription] === undefined) {
    return state
  }
  return { ...state, slots: state.slots.map((slot, id) => (id === subscription ? undefined : slot)) }
}

const invalidatedEffect = (state: ModelState, watched: number): ModelState => {
  const [effect, keepEffect] = state.invalidations
  return {
    ...state,
    invalidations: [effect + (watched === effectAtom ? 1 : 0), keepEffect + (watched === keepEffectAtom ? 1 : 0)],
  }
}

const refreshCounter = (state: ModelState): ModelState => {
  const reset = setCounter(state, 0)
  if (reset.invalidations !== state.invalidations) {
    return reset
  }
  const [effect, keepEffect] = reset.invalidations
  return { ...reset, invalidations: [effect + 1, keepEffect + 1] }
}

const refreshStep = (state: ModelState, watched: number): ModelState =>
  watched === counterAtom && state.materialized[counterAtom] === true
    ? refreshCounter(state)
    : invalidatedEffect(state, watched)

const modifyStep = (state: ModelState, value: number): ModelState => {
  const returned = state.counter
  return logLine(setCounter(state, value), `modify returned: ${returned}`)
}

const mountStep = (state: ModelState, watched: number): ModelState => {
  const touched = materializedWith(state, watched)
  return {
    ...touched,
    materialized: touched.materialized.map((isMaterialized, atom) => isMaterialized || atom === watched),
    slots: [...touched.slots, { kind: 'mount', watched }],
    mountSlots: [...touched.mountSlots, touched.slots.length],
  }
}

const unmountStep = (state: ModelState): ModelState => {
  const slot = state.mountSlots[state.mountSlots.length - 1]
  if (slot === undefined) {
    return state
  }
  return {
    ...state,
    slots: state.slots.map((entry, id) => (id === slot ? undefined : entry)),
    mountSlots: state.mountSlots.slice(0, -1),
  }
}

const batchModel = (state: ModelState, steps: ReadonlyArray<Step>): ModelState => {
  if (state.disposed) {
    return steps.reduce(modelStep, state)
  }
  const done = steps.reduce(modelStep, { ...state, depth: state.depth + 1 })
  return state.depth > 0 ? { ...done, depth: state.depth } : hear({ ...done, depth: 0 })
}
/**
 * An `Advance` far past the idle TTL forgets every value nothing holds: a
 * writable restarts at its definition and derived values recompute on the next
 * read. A listener, a mount and a `keepAlive` hold a value, and a held value
 * holds the values it reads.
 */
const advanceStep = (state: ModelState): ModelState => {
  const held = heldAtoms(state)
  const forgotten = state.materialized[effectAtom] === true && held[effectAtom] === false
  return {
    ...(forgotten ? invalidatedEffect(state, effectAtom) : state),
    materialized: held,
    counter: held[counterAtom] === true ? state.counter : 0,
    mirror: held[mirrorAtom] === true ? state.mirror : 0,
  }
}

const disposedStep = (state: ModelState, current: Step): ModelState =>
  Match.valueTags(current, {
    Set: () => logLine(state, 'write disposed'),
    Increment: () => logLine(state, 'write disposed'),
    Modify: () => logLine(state, 'write disposed'),
    Refresh: () => logLine(state, 'write disposed'),
    Batch: ({ steps }) => steps.reduce(modelStep, state),
    Read: () => logLine(state, 'read disposed'),
    Subscribe: () => logLine(state, 'subscribe disposed'),
    Mount: () => logLine(state, 'subscribe disposed'),
    Unsubscribe: () => state,
    Unmount: () => state,
    Advance: () => state,
    Dispose: () => state,
  })

const modelStep = (state: ModelState, current: Step): ModelState => {
  if (state.disposed) {
    return disposedStep(state, current)
  }
  return Match.valueTags(current, {
    Set: ({ value }) => setCounter(state, value),
    Increment: () => setCounter(state, state.counter + 1),
    Read: ({ watched }) => readStep(state, watched),
    Subscribe: ({ watched, writer, immediate }) => subscribeStepModel(state, watched, writer, immediate),
    Unsubscribe: ({ subscription }) => unsubscribeStep(state, subscription),
    Batch: ({ steps }) => batchModel(state, steps),
    Refresh: ({ watched }) => refreshStep(state, watched),
    Modify: ({ value }) => modifyStep(state, value),
    Mount: ({ watched }) => mountStep(state, watched),
    Unmount: () => unmountStep(state),
    Advance: () => advanceStep(state),
    Dispose: () => ({ ...state, disposed: true }),
  })
}

const finalLine = (state: ModelState): ModelState => {
  if (state.disposed) {
    return logLine(state, 'final: disposed')
  }
  return logLine(
    state,
    `final: ${derive(state.counter).join(',')} effects=${state.counter},${state.counter} mirror=${state.mirror}`,
  )
}

// -----------------------------------------------------------------------------
// R19 without engine internals: a run bound, and the freshness a read promises
// -----------------------------------------------------------------------------

/**
 * R19 as a consumer states it: one invalidation re-runs an effect at most once,
 * so an effect runs at most once for its first build plus once per invalidation
 * — a write that moves the counter, a refresh of the effect itself, or an
 * `Advance` that forgets it. Observed and model both log the verdict for each
 * effect, so a registry that re-runs twice for one invalidation is visible.
 */
const effectRunBounds = (program: ReadonlyArray<Step>): readonly [number, number] => {
  const [effect, keepEffect] = program.reduce(modelStep, initial).invalidations
  return [effect + 1, keepEffect + 1]
}

const boundLines = (program: ReadonlyArray<Step>, runs: readonly [number, number]): ReadonlyArray<string> =>
  [effectAtom, keepEffectAtom].map((watched, which) => {
    const bound = effectRunBounds(program)[which] ?? 0
    const ran = runs[which] ?? 0
    return ran <= bound
      ? `effect ${watched} runs within bound`
      : `effect ${watched} runs exceeded bound (${ran} > ${bound})`
  })

/** The specification: what a subscriber hears and what a read returns. */
const modelLines = (program: ReadonlyArray<Step>): ReadonlyArray<string> => {
  const end = program.reduce(modelStep, initial)
  return [
    ...finalLine(end).log,
    `effect ${effectAtom} runs within bound`,
    `effect ${keepEffectAtom} runs within bound`,
  ]
}

const heardBy = (line: string): number => Number(line.slice('heard '.length, line.indexOf(':')))

interface Segments {
  readonly done: ReadonlyArray<string>
  readonly heard: ReadonlyArray<string>
}

const flushHeard = (segments: Segments): ReadonlyArray<string> => [
  ...segments.done,
  ...Arr.sort(segments.heard, Order.mapInput(Order.Number, heardBy)),
]

const collect = (segments: Segments, line: string): Segments =>
  line.startsWith('heard ')
    ? { done: segments.done, heard: [...segments.heard, line] }
    : { done: [...flushHeard(segments), line], heard: [] }

/**
 * Each subscriber's own sequence, and where it falls between reads, is the
 * contract; the order in which two different subscribers hear one write is not.
 */
const normalized = (log: ReadonlyArray<string>): ReadonlyArray<string> =>
  flushHeard(log.reduce(collect, { done: [], heard: [] }))

/**
 * The specification: what a subscriber hears and what a read returns, written
 * without a registry. A subscriber hears each change of the value it watches,
 * once, after the write (or the whole batch) that caused it; an `immediate`
 * subscribe hears the current value at once. Every read shows the counter
 * through its definition, and an effect read shows a success carrying the
 * counter as it stands after the write that invalidated it.
 */
export const specified = (program: ReadonlyArray<Step>): Effect.Effect<ReadonlyArray<string>> =>
  Effect.sync(() => normalized(modelLines(program)))

// -----------------------------------------------------------------------------
// the registry under test
// -----------------------------------------------------------------------------

interface Timer {
  readonly due: number
  readonly run: () => void
}

const manualClock = () => {
  const state: {
    time: number
    tasks: ReadonlyArray<() => void>
    timers: ReadonlyArray<Timer>
  } = { time: 0, tasks: [], timers: [] }
  const scheduleTask = (task: () => void): () => void => {
    state.tasks = [...state.tasks, task]
    return () => {
      state.tasks = state.tasks.filter((pending) => pending !== task)
    }
  }
  const runTasks = (): void => {
    const pending = state.tasks
    state.tasks = []
    pending.forEach((task) => task())
  }
  const now = (): number => state.time
  const scheduleTimer = (run: () => void, delayMillis: number): () => void => {
    const timer = { due: state.time + delayMillis, run }
    state.timers = [...state.timers, timer]
    return () => {
      state.timers = state.timers.filter((pending) => pending !== timer)
    }
  }
  const earliestDueBy = (target: number): Timer | undefined =>
    state.timers
      .filter((timer) => timer.due <= target)
      .reduce<Timer | undefined>(
        (earliest, timer) => (earliest === undefined || timer.due < earliest.due ? timer : earliest),
        undefined,
      )
  const fireUntil = (target: number): void => {
    runTasks()
    const next = earliestDueBy(target)
    if (next === undefined) {
      state.time = target
      return
    }
    state.time = next.due
    state.timers = state.timers.filter((timer) => timer !== next)
    next.run()
    fireUntil(target)
  }
  const advance = (millis: number): void => {
    fireUntil(state.time + millis)
    runTasks()
  }
  return { now, scheduleTask, scheduleTimer, advance }
}

/** The disposed outcome the registry documents: the operation fails, every time. */
const disposedOutcome = (kind: 'read' | 'write' | 'subscribe', op: () => void): string => {
  try {
    op()
    return `${kind} succeeded on a disposed registry`
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return message.endsWith('registry is disposed')
      ? `${kind} disposed`
      : `${kind} failed unexpectedly: ${message}`
  }
}

/** Runs a program against a fresh registry and returns what was heard and read. */
export const observed = (program: ReadonlyArray<Step>): Effect.Effect<ReadonlyArray<string>> =>
  Effect.sync(() => {
    const clock = manualClock()
    const registry = Atom.Registry.make({
      defaultIdleTTL: idleTTL,
      timeoutResolution: resolution,
      now: clock.now,
      scheduleTimer: clock.scheduleTimer,
      scheduleTask: clock.scheduleTask,
    })
    const runs: [number, number] = [0, 0]
    const counter = Atom.make(0)
    const doubled = Atom.make((get) => get(counter) * 2)
    const tripled = Atom.make((get) => get(doubled) + get(doubled) / 2)
    const oddOnly = Atom.make((get) => (Math.abs(get(counter) % 2) === 1 ? get(tripled) : -1))
    const effectValue = Atom.make((get) => {
      runs[0]++
      return Effect.succeed(get(counter))
    })
    const keepEffectValue = Atom.make((get) => {
      runs[1]++
      return Effect.succeed(get(counter))
    }).pipe(Atom.keepAlive)
    const mirror = Atom.make(0)

    const watchedAtom = (watched: number): Atom.Atom<number> =>
      watched === 0 ? counter : watched === 1 ? doubled : watched === 2 ? tripled : watched === 3 ? oddOnly : mirror
    const effectOf = (watched: number): 0 | 1 => (watched === effectAtom ? 0 : 1)

    let disposed = false
    const log: Array<string> = []
    const cancels: Array<(() => void) | undefined> = []
    const mountSlots: Array<number> = []

    const subscribeTo = (watched: number, f: (value: number) => void, immediate: boolean): void => {
      Atom.Registry.subscribe(registry, watchedAtom(watched), f, immediate ? { immediate: true } : undefined)
    }
    const run = (current: Step): void =>
      Match.valueTags(current, {
        Set: ({ value }) => Atom.Registry.set(registry, counter, value),
        Increment: () => Atom.Registry.update(registry, counter, (n) => n + 1),
        Read: ({ watched }) => {
          if (watched === effectAtom || watched === keepEffectAtom) {
            const result = Atom.Registry.get(registry, effectOf(watched) === 0 ? effectValue : keepEffectValue)
            log.push(
              `read ${watched}: ${Atom.AsyncResult.isSuccess(result) ? `success(${result.value})` : 'pending'}`,
            )
            return
          }
          log.push(`read ${watched}: ${Atom.Registry.get(registry, watchedAtom(watched))}`)
        },
        Subscribe: ({ watched, writer, immediate }) => {
          const id = cancels.length
          cancels.push(
            writer
              ? Atom.Registry.subscribe(
                registry,
                watchedAtom(watched),
                (value) => Atom.Registry.set(registry, mirror, value),
                immediate ? { immediate: true } : undefined,
              )
              : Atom.Registry.subscribe(
                registry,
                watchedAtom(watched),
                (value) => log.push(`heard ${id}: ${value}`),
                immediate ? { immediate: true } : undefined,
              ),
          )
        },
        Unsubscribe: ({ subscription }) => {
          const cancel = cancels[subscription]
          if (cancel !== undefined) {
            cancels[subscription] = undefined
          }
          cancel?.()
        },
        Batch: ({ steps }) => {
          if (disposed) {
            steps.forEach(runDisposed)
            return
          }
          Atom.Registry.batch(registry, () => steps.forEach(run))
        },
        Refresh: ({ watched }) => {
          if (watched === effectAtom) {
            Atom.Registry.refresh(registry, effectValue)
            return
          }
          if (watched === keepEffectAtom) {
            Atom.Registry.refresh(registry, keepEffectValue)
            return
          }
          Atom.Registry.refresh(registry, watchedAtom(watched))
        },
        Modify: ({ value }) => {
          const returned = Atom.Registry.modify(registry, counter, (n) => [n, value])
          log.push(`modify returned: ${returned}`)
        },
        Mount: ({ watched }) => {
          const slot = cancels.length
          cancels.push(
            watched === effectAtom
              ? Atom.Registry.subscribe(registry, effectValue, () => {}, { immediate: true })
              : watched === keepEffectAtom
              ? Atom.Registry.subscribe(registry, keepEffectValue, () => {}, { immediate: true })
              : Atom.Registry.subscribe(registry, watchedAtom(watched), () => {}, { immediate: true }),
          )
          mountSlots.push(slot)
        },
        Unmount: () => {
          const slot = mountSlots.pop()
          if (slot === undefined) {
            return
          }
          const cancel = cancels[slot]
          cancels[slot] = undefined
          cancel?.()
        },
        Advance: ({ millis }) => {
          clock.advance(millis)
        },
        Dispose: () => {
          disposed = true
          Atom.Registry.dispose(registry)
        },
      })

    const runDisposed = (current: Step): void =>
      Match.valueTags(current, {
        Set: ({ value }) => {
          log.push(disposedOutcome('write', () => Atom.Registry.set(registry, counter, value)))
        },
        Increment: () => {
          log.push(disposedOutcome('write', () => Atom.Registry.update(registry, counter, (n) => n + 1)))
        },
        Modify: ({ value }) => {
          log.push(
            disposedOutcome('write', () => {
              Atom.Registry.modify(registry, counter, (n) => [n, value])
            }),
          )
        },
        Refresh: ({ watched }) => {
          log.push(
            disposedOutcome('write', () => {
              if (watched === effectAtom) {
                Atom.Registry.refresh(registry, effectValue)
                return
              }
              if (watched === keepEffectAtom) {
                Atom.Registry.refresh(registry, keepEffectValue)
                return
              }
              Atom.Registry.refresh(registry, watchedAtom(watched))
            }),
          )
        },
        Read: ({ watched }) => {
          log.push(
            disposedOutcome('read', () => {
              Atom.Registry.get(registry, watchedAtom(watched))
            }),
          )
        },
        Subscribe: ({ watched }) => {
          log.push(
            disposedOutcome('subscribe', () => {
              subscribeTo(watched, () => {}, false)
            }),
          )
        },
        Mount: ({ watched }) => {
          log.push(
            disposedOutcome('subscribe', () => {
              subscribeTo(watched, () => {}, true)
            }),
          )
        },
        Batch: ({ steps }) => {
          steps.forEach(runDisposed)
        },
        Unsubscribe: ({ subscription }) => {
          const cancel = cancels[subscription]
          cancels[subscription] = undefined
          cancel?.()
        },
        Unmount: () => {
          const slot = mountSlots.pop()
          if (slot === undefined) {
            return
          }
          const cancel = cancels[slot]
          cancels[slot] = undefined
          cancel?.()
        },
        Advance: ({ millis }) => {
          clock.advance(millis)
        },
        Dispose: () => {
          Atom.Registry.dispose(registry)
        },
      })

    program.forEach((current) => {
      if (disposed) {
        runDisposed(current)
        return
      }
      run(current)
    })

    if (disposed) {
      log.push('final: disposed')
    } else {
      const finalCounter = Atom.Registry.get(registry, counter)
      const finalDoubled = Atom.Registry.get(registry, doubled)
      const finalTripled = Atom.Registry.get(registry, tripled)
      const finalOdd = Atom.Registry.get(registry, oddOnly)
      const finalEffect = Atom.Registry.get(registry, effectValue)
      const finalKeep = Atom.Registry.get(registry, keepEffectValue)
      const finalMirror = Atom.Registry.get(registry, mirror)
      const effectWorth = Atom.AsyncResult.isSuccess(finalEffect) ? finalEffect.value : Number.NaN
      const keepWorth = Atom.AsyncResult.isSuccess(finalKeep) ? finalKeep.value : Number.NaN
      log.push(
        `final: ${finalCounter},${finalDoubled},${finalTripled},${finalOdd} effects=${effectWorth},${keepWorth} mirror=${finalMirror}`,
      )
    }
    log.push(...boundLines(program, [runs[0], runs[1]]))
    return normalized(log)
  })
