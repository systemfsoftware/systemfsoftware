import { Chunk, Data, Option } from 'effect'

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
