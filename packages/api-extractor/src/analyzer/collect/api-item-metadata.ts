import { Chunk, Data, Option } from 'effect'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'

import { VisitorState } from '../../collector/VisitorState.js'
import { ReleaseTag } from '../../model/index.js'
import type { EffectiveDocComment } from './effective-doc-comment.js'

export interface ApiItemMetadataFields {
  readonly declaredReleaseTag: ReleaseTag
  readonly effectiveReleaseTag: ReleaseTag
  readonly releaseTagSameAsParent: boolean
  readonly isEventProperty: boolean
  readonly isOverride: boolean
  readonly isSealed: boolean
  readonly isVirtual: boolean
  readonly isPreapproved: boolean
  readonly deprecated: boolean
  readonly customBlockTagNames: Chunk.Chunk<string>
  readonly modifierTagNames: Chunk.Chunk<string>
  readonly tsdocComment: Option.Option<EffectiveDocComment>
  readonly undocumented: boolean
  readonly docCommentEnhancerVisitorState: VisitorState
}

export class ApiItemMetadata extends Data.TaggedClass('ApiItemMetadata')<ApiItemMetadataFields> {}

const booleanOrder: Order.Order<boolean> = Order.mapInput(Order.Number, (value: boolean) =>
  Match.value(value).pipe(
    Match.when(true, () => 1),
    Match.when(false, () => 0),
    Match.exhaustive,
  ))

const fieldOf = <T, F>(order: Order.Order<F>, pick: (metadata: T) => F): Order.Order<T> => Order.mapInput(order, pick)

const releaseTagOf = (metadata: ApiItemMetadata): ReleaseTag => metadata.declaredReleaseTag
const effectiveOf = (metadata: ApiItemMetadata): ReleaseTag => metadata.effectiveReleaseTag
const sameAsParentOf = (metadata: ApiItemMetadata): boolean => metadata.releaseTagSameAsParent
const eventPropertyOf = (metadata: ApiItemMetadata): boolean => metadata.isEventProperty
const overrideOf = (metadata: ApiItemMetadata): boolean => metadata.isOverride
const sealedOf = (metadata: ApiItemMetadata): boolean => metadata.isSealed
const virtualOf = (metadata: ApiItemMetadata): boolean => metadata.isVirtual
const preapprovedOf = (metadata: ApiItemMetadata): boolean => metadata.isPreapproved
const deprecatedOf = (metadata: ApiItemMetadata): boolean => metadata.deprecated
const undocumentedOf = (metadata: ApiItemMetadata): boolean => metadata.undocumented
const customBlocksOf = (metadata: ApiItemMetadata): ReadonlyArray<string> =>
  Chunk.toReadonlyArray(metadata.customBlockTagNames)
const modifierTagsOf = (metadata: ApiItemMetadata): ReadonlyArray<string> =>
  Chunk.toReadonlyArray(metadata.modifierTagNames)
const visitorStateOf = (metadata: ApiItemMetadata): VisitorState => metadata.docCommentEnhancerVisitorState

export const ApiItemMetadataOrder: Order.Order<ApiItemMetadata> = Order.combine(
  fieldOf(Order.Number, releaseTagOf),
  Order.combine(
    fieldOf(Order.Number, effectiveOf),
    Order.combine(
      fieldOf(booleanOrder, sameAsParentOf),
      Order.combine(
        fieldOf(booleanOrder, eventPropertyOf),
        Order.combine(
          fieldOf(booleanOrder, overrideOf),
          Order.combine(
            fieldOf(booleanOrder, sealedOf),
            Order.combine(
              fieldOf(booleanOrder, virtualOf),
              Order.combine(
                fieldOf(booleanOrder, preapprovedOf),
                Order.combine(
                  fieldOf(booleanOrder, deprecatedOf),
                  Order.combine(
                    fieldOf(Order.Array(Order.String), customBlocksOf),
                    Order.combine(
                      fieldOf(Order.Array(Order.String), modifierTagsOf),
                      Order.combine(
                        fieldOf(booleanOrder, undocumentedOf),
                        fieldOf(Order.Number, visitorStateOf),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
)
