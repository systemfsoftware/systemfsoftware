import { FileName, MutantId } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

export class PlacementFailed
  extends S.TaggedError<PlacementFailed>('@systemfsoftware/stryker-js-instrumenter/PlacementFailed')(
    'PlacementFailed',
    {
      fileName: FileName,
      placerName: S.String,
      mutantIds: S.Array(MutantId),
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    return `${this.placerName} could not place mutants with type(s): "${this.mutantIds.join(', ')}" in ${this.fileName}`
  }
}

export class TransformFailed
  extends S.TaggedError<TransformFailed>('@systemfsoftware/stryker-js-instrumenter/TransformFailed')(
    'TransformFailed',
    {
      fileName: FileName,
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    return `Failed to transform ${this.fileName}`
  }
}
