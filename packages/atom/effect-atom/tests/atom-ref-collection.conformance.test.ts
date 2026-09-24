import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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
  '@systemfsoftware/effect-atom/tests/atom-ref-collection.conformance.test/Collections',
) {}

const removedAt = (collection: Atom.Ref.Collection<number>, index: number): Items => {
  const ref = Atom.Ref.get(collection)[index]
  return ref === undefined
    ? Atom.Ref.toArray(collection)
    : Atom.Ref.toArray(Atom.Ref.remove(collection, ref))
}

const freshHandle = (): CollectionHandle => {
  const collection = Atom.Ref.collection<number>([])
  return {
    push: (value) => Atom.Ref.toArray(Atom.Ref.push(collection, value)),
    insertAt: (index, value) => Atom.Ref.toArray(Atom.Ref.insertAt(collection, index, value)),
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

const collectionCheck = (
  subject: Layer.Layer<Collections>,
  spec: { readonly sequences: number; readonly operations: number },
) =>
  Conformance.sequential(subject, {
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

Feature('A shopping list collection that stays with a plain list', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A shopping list keeps every push, insert, and removal a plain list would keep',
      Gherkin.Do.pipe(
        Given('an empty shopping list next to an empty plain list')(
          'subject',
          () => Effect.succeed(collectionLayer),
        ),
        When('a thousand rounds of pushing 1, 2, or 3, inserting, and removing are replayed')(
          'report',
          (s) => collectionCheck(s.subject, { sequences: 1000, operations: 10 }),
        ),
        Then('the shopping list matches the plain list after every round')((s) => {
          passHistories(s.report)
        }),
      ),
    )
  })
