import * as S from 'effect/Schema'

export class PlacementFailed
  extends S.TaggedError<PlacementFailed>('@systemfsoftware/stryker-js-instrumenter/PlacementFailed')(
    'PlacementFailed',
    {
      fileName: S.String,
      placerName: S.String,
      mutantIds: S.Array(S.String),
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
      fileName: S.String,
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    return `Failed to transform ${this.fileName}`
  }
}
