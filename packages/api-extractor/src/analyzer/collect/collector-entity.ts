import { Chunk, Data, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import type { Ordering } from 'effect/Ordering'

import { type AstEntityRef, AstEntityRefEquivalence } from '../graph/ast-entity.js'

export interface ConsumableView {
  readonly localName: string
  readonly exportedNames: Chunk.Chunk<string>
  readonly localExportNamesByParent: Chunk.Chunk<readonly [AstEntityRef, Chunk.Chunk<string>]>
}

export interface CollectorEntityFields {
  readonly astEntity: AstEntityRef
  readonly localName: string
  readonly nameForEmit: Option.Option<string>
  readonly exportedNames: Chunk.Chunk<string>
  readonly localExportNamesByParent: Chunk.Chunk<readonly [AstEntityRef, Chunk.Chunk<string>]>
  readonly exported: boolean
  readonly consumable: boolean
  readonly shouldInlineExport: boolean
}

export class CollectorEntity extends Data.TaggedClass('CollectorEntity')<CollectorEntityFields> {}

const isNonEmpty = (names: Chunk.Chunk<string>): boolean => Chunk.size(names) > 0

export const exportedOf = (view: ConsumableView): boolean =>
  isNonEmpty(view.exportedNames) ||
  Arr.some(Chunk.toReadonlyArray(view.localExportNamesByParent), (entry) => isNonEmpty(entry[1]))

const hasConsumableParent = (
  views: (ref: AstEntityRef) => Option.Option<ConsumableView>,
  view: ConsumableView,
): boolean =>
  Arr.some(Chunk.toReadonlyArray(view.localExportNamesByParent), (entry) =>
    isNonEmpty(entry[1]) &&
    Option.exists(views(entry[0]), () => consumableOf(views, entry[0])))

export const consumableOf = dual<
  (ref: AstEntityRef) => (views: (ref: AstEntityRef) => Option.Option<ConsumableView>) => boolean,
  (views: (ref: AstEntityRef) => Option.Option<ConsumableView>, ref: AstEntityRef) => boolean
>(2, (
  views: (ref: AstEntityRef) => Option.Option<ConsumableView>,
  ref: AstEntityRef,
): boolean =>
  Option.match(views(ref), {
    onNone: () => false,
    onSome: (view) => isNonEmpty(view.exportedNames) || hasConsumableParent(views, view),
  }))

export const firstExportingConsumableParentOf = dual<
  (ref: AstEntityRef) => (views: (ref: AstEntityRef) => Option.Option<ConsumableView>) => Option.Option<AstEntityRef>,
  (views: (ref: AstEntityRef) => Option.Option<ConsumableView>, ref: AstEntityRef) => Option.Option<AstEntityRef>
>(2, (
  views: (ref: AstEntityRef) => Option.Option<ConsumableView>,
  ref: AstEntityRef,
): Option.Option<AstEntityRef> =>
  Option.flatMap(views(ref), (view) =>
    Option.map(
      Arr.findFirst(
        Chunk.toReadonlyArray(view.localExportNamesByParent),
        (entry) =>
          isNonEmpty(entry[1]) &&
          Option.exists(views(entry[0]), () => consumableOf(views, entry[0])),
      ),
      (entry) => entry[0],
    )))

export const singleExportNameOf = (view: ConsumableView): Option.Option<string> =>
  Match.value(Chunk.size(view.exportedNames)).pipe(
    Match.when(1, () => Chunk.get(view.exportedNames, 0)),
    Match.orElse(() => Option.none<string>()),
  )

export const sortKeyIgnoringUnderscore = (identifier: string): string =>
  Match.value(identifier.length === 0).pipe(
    Match.when(true, () => ''),
    Match.when(false, () =>
      Match.value(identifier.startsWith('_')).pipe(
        Match.when(true, () => {
          const withoutUnderscore = identifier.slice(1)
          return `${withoutUnderscore.toLowerCase()}*${withoutUnderscore}*_`
        }),
        Match.when(false, () => `${identifier.toLowerCase()}*${identifier}`),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const collectorEntitySortKeyOf = (
  entity: ConsumableView & { readonly nameForEmit: Option.Option<string> },
): string => sortKeyIgnoringUnderscore(Option.getOrElse(entity.nameForEmit, () => entity.localName))

export const CollectorEntityOrder: {
  (that: CollectorEntity): (self: CollectorEntity) => Ordering
  (self: CollectorEntity, that: CollectorEntity): Ordering
} = dual(2, Order.mapInput(Order.String, collectorEntitySortKeyOf))

export const sameEntityRef = dual<
  (right: AstEntityRef) => (left: AstEntityRef) => boolean,
  (left: AstEntityRef, right: AstEntityRef) => boolean
>(2, (left: AstEntityRef, right: AstEntityRef): boolean => AstEntityRefEquivalence(left, right))
