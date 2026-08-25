import * as S from 'effect/Schema'

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
