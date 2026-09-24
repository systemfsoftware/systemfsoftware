import { Atom } from '@systemfsoftware/effect-atom'
import { Array as Arr, Data, Effect, Match, Order } from 'effect'
import * as fc from 'fast-check'

/**
 * One step of a program run against a registry holding a counter `c` and
 * three values derived from it: `2c`, `3c`, and `3c` when `c` is odd else `-1`.
 * `watched` picks one of those four by position.
 */
export type Step = Data.TaggedEnum<{
  Set: { readonly value: number }
  Increment: {}
  Read: { readonly watched: number }
  Subscribe: { readonly watched: number }
  Unsubscribe: { readonly subscription: number }
  Batch: { readonly values: ReadonlyArray<number> }
  Refresh: { readonly watched: number }
}>

const Step = Data.taggedEnum<Step>()

const counterValue = fc.integer({ min: -3, max: 3 })
const watched = fc.integer({ min: 0, max: 3 })

const step: fc.Arbitrary<Step> = fc.oneof(
  counterValue.map((value) => Step.Set({ value })),
  fc.constant(Step.Increment()),
  watched.map((w) => Step.Read({ watched: w })),
  watched.map((w) => Step.Subscribe({ watched: w })),
  fc.integer({ min: 0, max: 4 }).map((subscription) => Step.Unsubscribe({ subscription })),
  fc.array(counterValue, { maxLength: 3 }).map((values) => Step.Batch({ values })),
  watched.map((w) => Step.Refresh({ watched: w })),
)

export const programs: fc.Arbitrary<ReadonlyArray<Step>> = fc.array(step, { maxLength: 25 })

const derive = (counter: number): ReadonlyArray<number> => [
  counter,
  counter * 2,
  counter * 3,
  Math.abs(counter % 2) === 1 ? counter * 3 : -1,
]

interface Subscription {
  readonly watched: number
  readonly lastHeard: number
}

interface ModelState {
  readonly counter: number
  readonly subscriptions: ReadonlyArray<Subscription | undefined>
  readonly log: ReadonlyArray<string>
}

const hear = (state: ModelState, counter: number): ModelState => {
  const values = derive(counter)
  const heard = state.subscriptions.map((subscription, id) =>
    subscription === undefined || values[subscription.watched] === subscription.lastHeard
      ? { subscription, line: [] }
      : {
        subscription: { watched: subscription.watched, lastHeard: values[subscription.watched] ?? Number.NaN },
        line: [`heard ${id}: ${values[subscription.watched]}`],
      }
  )
  return {
    counter,
    subscriptions: heard.map(({ subscription }) => subscription),
    log: [...state.log, ...heard.flatMap(({ line }) => line)],
  }
}

const readLine = (counter: number, w: number): string => `read ${w}: ${derive(counter)[w]}`

const modelStep = (state: ModelState, current: Step): ModelState =>
  Match.valueTags(current, {
    Set: ({ value }) => hear(state, value),
    Increment: () => hear(state, state.counter + 1),
    Read: ({ watched: w }) => ({ ...state, log: [...state.log, readLine(state.counter, w)] }),
    Subscribe: ({ watched: w }) => ({
      ...state,
      subscriptions: [...state.subscriptions, { watched: w, lastHeard: derive(state.counter)[w] ?? Number.NaN }],
    }),
    Unsubscribe: ({ subscription }) => ({
      ...state,
      subscriptions: state.subscriptions.map((s, id) => (id === subscription ? undefined : s)),
    }),
    Batch: ({ values }) =>
      Arr.match(values, { onEmpty: () => state, onNonEmpty: (vs) => hear(state, Arr.lastNonEmpty(vs)) }),
    Refresh: ({ watched: w }) => (w === 0 ? hear(state, 0) : state),
  })

const finalLine = (counter: number): string => `final: ${derive(counter).join(',')}`

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
 * contract; the order in which different subscribers hear one write is not.
 */
const normalized = (log: ReadonlyArray<string>): ReadonlyArray<string> =>
  flushHeard(log.reduce(collect, { done: [], heard: [] }))

/**
 * The specification: what a subscriber hears and what a read returns, written
 * without a registry. A subscriber hears each change of the value it watches,
 * once, after the write (or the whole batch) that caused it. Refreshing re-runs
 * a value's read, so the counter returns to its initial `0` and a derived value
 * recomputes to what it already was.
 */
export const specified = (program: ReadonlyArray<Step>): Effect.Effect<ReadonlyArray<string>> =>
  Effect.sync(() => {
    const end = program.reduce(modelStep, { counter: 0, subscriptions: [], log: [] })
    return normalized([...end.log, finalLine(end.counter)])
  })

/** Runs a program against a fresh registry and returns what was heard and read. */
export const observed = (program: ReadonlyArray<Step>): Effect.Effect<ReadonlyArray<string>> =>
  Effect.sync(() => {
    const registry = Atom.Registry.make()
    const counter = Atom.make(0)
    const doubled = Atom.make((get) => get(counter) * 2)
    const tripled = Atom.make((get) => get(doubled) + get(doubled) / 2)
    const oddOnly = Atom.make((get) => (Math.abs(get(counter) % 2) === 1 ? get(tripled) : -1))
    const values: ReadonlyArray<Atom.Atom<number>> = [counter, doubled, tripled, oddOnly]
    const at = (w: number): Atom.Atom<number> => values[w] ?? counter
    const log: Array<string> = []
    const cancels: Array<(() => void) | undefined> = []
    const run = (current: Step): void =>
      Match.valueTags(current, {
        Set: ({ value }) => Atom.Registry.set(registry, counter, value),
        Increment: () => Atom.Registry.update(registry, counter, (n) => n + 1),
        Read: ({ watched: w }) => {
          log.push(`read ${w}: ${Atom.Registry.get(registry, at(w))}`)
        },
        Subscribe: ({ watched: w }) => {
          const id = cancels.length
          cancels.push(Atom.Registry.subscribe(registry, at(w), (value) => log.push(`heard ${id}: ${value}`)))
        },
        Unsubscribe: ({ subscription }) => {
          cancels.splice(
            subscription,
            1,
            ...cancels.slice(subscription, subscription + 1).map((cancel) => {
              cancel?.()
              return undefined
            }),
          )
        },
        Batch: ({ values: vs }) =>
          Atom.Registry.batch(registry, () => vs.forEach((value) => Atom.Registry.set(registry, counter, value))),
        Refresh: ({ watched: w }) => Atom.Registry.refresh(registry, at(w)),
      })
    program.forEach(run)
    log.push(`final: ${values.map((value) => Atom.Registry.get(registry, value)).join(',')}`)
    return normalized(log)
  })
