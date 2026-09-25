import { Context, Effect, Layer, Match, Ref } from 'effect'

import type { CollectionCommand } from './collection.model.js'

/** What a collection offers to its callers through the public surface. */
export interface CollectionHandle {
  readonly push: (value: number) => Effect.Effect<number>
  readonly insertAt: (index: number, value: number) => Effect.Effect<number>
  readonly remove: Effect.Effect<number | undefined>
}

export class Collections extends Context.Service<Collections, CollectionHandle>()(
  '@systemfsoftware/conformance-spec/tests/Collections',
) {}

/** A correct collection: every operation matches the collection model. */
export const correctCollection: Layer.Layer<Collections> = Layer.effect(
  Collections,
  Effect.gen(function*() {
    const items = yield* Ref.make<ReadonlyArray<number>>([])
    return correctHandle(items)
  }),
)
/** A planted bug: an insertion at the end index drops the element instead of appending it. */
export const endIndexDroppingCollection: Layer.Layer<Collections> = Layer.effect(
  Collections,
  Effect.gen(function*() {
    const items = yield* Ref.make<ReadonlyArray<number>>([])
    return endIndexDroppingHandle(items)
  }),
)

/** The response the caller observes: the collection's new length. */
const appended = (items: ReadonlyArray<number>, value: number): readonly [number, ReadonlyArray<number>] => [
  items.length + 1,
  [...items, value],
]

const spliced = (
  items: ReadonlyArray<number>,
  index: number,
  value: number,
): readonly [number, ReadonlyArray<number>] => [
  items.length + 1,
  [...items.slice(0, index), value, ...items.slice(index)],
]

/** The response the caller observes: the removed element, or undefined when the collection is empty. */
const dropped = (items: ReadonlyArray<number>): readonly [number | undefined, ReadonlyArray<number>] => [
  items[items.length - 1],
  items.slice(0, -1),
]

/** One public operation of either collection, run inside the implementation's context. */
export const runCollectionCommand = (
  command: CollectionCommand,
): Effect.Effect<number | undefined, never, Collections> =>
  Effect.gen(function*() {
    const collection = yield* Collections
    return yield* Match.value(command).pipe(
      Match.tag('Push', (push) => collection.push(push.value)),
      Match.tag('InsertAt', (at) => collection.insertAt(at.index, at.value)),
      Match.tag('Remove', () => collection.remove),
      Match.exhaustive,
    )
  })

const correctHandle = (items: Ref.Ref<ReadonlyArray<number>>): CollectionHandle => ({
  push: (value) => Ref.modify(items, (current) => appended(current, value)),
  insertAt: (index, value) => Ref.modify(items, (current) => spliced(current, index, value)),
  remove: Ref.modify(items, (current) => dropped(current)),
})

const endIndexDroppingHandle = (items: Ref.Ref<ReadonlyArray<number>>): CollectionHandle => ({
  ...correctHandle(items),
  insertAt: (index, value) => Ref.modify(items, (current) => droppedAtEnd(current, index, value)),
})

const droppedAtEnd = (
  items: ReadonlyArray<number>,
  index: number,
  value: number,
): readonly [number, ReadonlyArray<number>] =>
  index === items.length ? [items.length, items] : spliced(items, index, value)
