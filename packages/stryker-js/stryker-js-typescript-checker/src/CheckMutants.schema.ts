import { Wire } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

/** A file name the node map can be keyed by: non-empty, and naming an extension. */
const SourceFileSchema = Wire.mint(S.NonEmptyString.pipe(S.check(S.isPattern(/\.[^./\\]+$/))))

const DiagnosticSchema = Wire.wire({
  fileName: Wire.mint(S.optional(SourceFileSchema)),
  text: Wire.mint(S.String),
})

export interface NodeDecodedShape {
  readonly fileName: string
  readonly parents: readonly NodeDecodedShape[]
  readonly children: readonly NodeDecodedShape[]
}

const TSFileNodeSchema: Wire.Minted<NodeDecodedShape, unknown> = Wire.mint(
  S.suspend(() =>
    Wire.wire({
      fileName: SourceFileSchema,
      parents: Wire.mint(S.Array(TSFileNodeSchema)),
      children: Wire.mint(S.Array(TSFileNodeSchema)),
    })
  ),
)

export class CheckMutantsInput extends S.TaggedClass<CheckMutantsInput>()(
  'CheckMutantsInput',
  {
    mutants: S.Array(Mutant),
    diagnostics: S.Array(DiagnosticSchema),
    nodes: Wire.mint(S.Record(SourceFileSchema, TSFileNodeSchema)),
  },
) {}

export type MutantDecoded = S.Schema.Type<typeof Mutant>
export type DiagnosticDecoded = S.Schema.Type<typeof DiagnosticSchema>
export type NodeDecoded = NodeDecodedShape
