import { Conformance } from '@systemfsoftware/conformance-spec'
import { AtomRef } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Match } from 'effect'

import { CollectionCommand, collectionModel } from './__fixtures__/collection.model.js'

const Feature = makeFeature({ it })

type Items = ReadonlyArray<number>

interface CollectionHandle {
  readonly push: (value: number) => Items
  readonly insertAt: (index: number, value: number) => Items
  readonly removeAt: (index: number) => Items
}

class Collections extends Context.Service<Collections, CollectionHandle>()(
  '@systemfsoftware/effect-atom/tests/Collections',
) {}

const removedAt = (collection: AtomRef.Collection<number>, index: number): Items => {
  const ref = collection.value[index]
  return ref === undefined ? collection.toArray() : collection.remove(ref).toArray()
}

const freshHandle = (): CollectionHandle => {
  const collection = AtomRef.collection<number>([])
  return {
    push: (value) => collection.push(value).toArray(),
    insertAt: (index, value) => collection.insertAt(index, value).toArray(),
    removeAt: (index) => removedAt(collection, index),
  }
}

const collectionLayer: Layer.Layer<Collections> = Layer.effect(Collections, Effect.sync(freshHandle))

const applied = (handle: CollectionHandle, command: CollectionCommand): Items =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      Push: (push) => handle.push(push.value),
      InsertAt: (at) => handle.insertAt(at.index, at.value),
      RemoveAt: (at) => handle.removeAt(at.index),
    }),
  )
const runCollectionCommand = (command: CollectionCommand): Effect.Effect<Items, never, Collections> =>
  Effect.flatMap(Collections, (handle) => Effect.sync(() => applied(handle, command)))

const collectionCheck = (spec: { readonly sequences: number; readonly operations: number }) =>
  Conformance.sequential(collectionLayer, {
    commands: CollectionCommand,
    model: collectionModel,
    run: runCollectionCommand,
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

Feature('A reactive collection that follows a plain array')
  .live('the scenario drives its own simulation-kernel run, and a conformance check cannot run inside one')
  .body(({ scenario }) => {
    scenario(
      'Pushing, inserting, and removing across a thousand generated sequences keeps the collection with the array',
      Gherkin.Do.pipe(
        Given('a fresh collection behind its public pushing, inserting, and removing')(
          'checked',
          () => collectionCheck({ sequences: 1000, operations: 10 }),
        ),
        Then('every generated sequence is explained by the array model')((s) => {
          passHistories(s.checked)
        }),
      ),
    )
  })
