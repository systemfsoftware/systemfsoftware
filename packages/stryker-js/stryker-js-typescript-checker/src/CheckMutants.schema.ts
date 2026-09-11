import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

/** A file name the node map can be keyed by: non-empty, and naming an extension. */
const SourceFileSchema = S.NonEmptyString.pipe(S.check(S.isPattern(/\.[^./\\]+$/)))

const DiagnosticSchema = S.Struct({
  fileName: S.optional(SourceFileSchema),
  text: S.String,
})

export interface NodeDecodedShape {
  readonly fileName: string
  readonly parents: readonly NodeDecodedShape[]
  readonly children: readonly NodeDecodedShape[]
}

const TSFileNodeSchema: S.Codec<NodeDecodedShape, unknown> = S.suspend(() =>
  S.Struct({
    fileName: SourceFileSchema,
    parents: S.Array(TSFileNodeSchema),
    children: S.Array(TSFileNodeSchema),
  })
)

export class CheckMutantsInput extends S.TaggedClass<CheckMutantsInput>()(
  'CheckMutantsInput',
  {
    mutants: S.Array(Mutant),
    diagnostics: S.Array(DiagnosticSchema),
    nodes: S.Record(SourceFileSchema, TSFileNodeSchema),
  },
) {}

export type MutantDecoded = S.Schema.Type<typeof Mutant>
export type DiagnosticDecoded = S.Schema.Type<typeof DiagnosticSchema>
export type NodeDecoded = NodeDecodedShape
