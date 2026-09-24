import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, Data, Option } from 'effect'

import type { NodeId } from '../TypeScriptInternals.js'

export interface DeclarationMetadataFields {
  readonly tsdocParserContext: Option.Option<tsdoc.ParserContext>
  readonly isAncillary: boolean
  readonly ancillaryDeclarationIds: Chunk.Chunk<NodeId>
}

export class DeclarationMetadata extends Data.TaggedClass('DeclarationMetadata')<DeclarationMetadataFields> {}
