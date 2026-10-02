import { Data } from 'effect'

import { ReleaseTag } from '../../model/index.js'

export interface SymbolMetadataFields {
  readonly maxEffectiveReleaseTag: ReleaseTag
}

export class SymbolMetadata extends Data.TaggedClass('SymbolMetadata')<SymbolMetadataFields> {}
