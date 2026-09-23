import { Data } from 'effect'
import * as Order from 'effect/Order'

import { ReleaseTag } from '../../model/index.js'

export interface SymbolMetadataFields {
  readonly maxEffectiveReleaseTag: ReleaseTag
}

export class SymbolMetadata extends Data.TaggedClass('SymbolMetadata')<SymbolMetadataFields> {}

export const SymbolMetadataOrder: Order.Order<SymbolMetadata> = Order.mapInput(
  Order.Number,
  (metadata: SymbolMetadata) => metadata.maxEffectiveReleaseTag,
)
