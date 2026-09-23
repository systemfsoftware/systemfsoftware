import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, Data, Option } from 'effect'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'

import type { NodeId } from '../TypeScriptInternals.js'

export interface DeclarationMetadataFields {
  readonly tsdocParserContext: Option.Option<tsdoc.ParserContext>
  readonly isAncillary: boolean
  readonly ancillaryDeclarationIds: Chunk.Chunk<NodeId>
}

export class DeclarationMetadata extends Data.TaggedClass('DeclarationMetadata')<DeclarationMetadataFields> {}

const booleanOrder: Order.Order<boolean> = Order.mapInput(Order.Number, (value: boolean) =>
  Match.value(value).pipe(
    Match.when(true, () => 1),
    Match.when(false, () => 0),
    Match.exhaustive,
  ))

const ancillaryOrder: Order.Order<DeclarationMetadata> = Order.mapInput(
  Order.Array(Order.Number),
  (metadata: DeclarationMetadata) => Chunk.toReadonlyArray(metadata.ancillaryDeclarationIds),
)

export const DeclarationMetadataOrder: Order.Order<DeclarationMetadata> = Order.combine(
  Order.mapInput(booleanOrder, (metadata: DeclarationMetadata) => metadata.isAncillary),
  ancillaryOrder,
)
