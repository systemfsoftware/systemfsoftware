import * as S from 'effect/Schema'

export class ParseFailed
  extends S.TaggedError<ParseFailed>('@systemfsoftware/stryker-js-instrumenter/ParseFailed')('ParseFailed', {
    fileName: S.String,
    message: S.String,
    location: S.Struct({ line: S.Finite, column: S.Finite }),
    cause: S.Defect(),
  })
{
  override get message(): string {
    return `Failed to parse ${this.fileName} at ${this.location.line}:${this.location.column}: ${this.message}`
  }
}

export class ParserNotFound
  extends S.TaggedError<ParserNotFound>('@systemfsoftware/stryker-js-instrumenter/ParserNotFound')('ParserNotFound', {
    fileName: S.String,
    extension: S.String,
    cause: S.Defect(),
  })
{
  override get message(): string {
    return `No parser registered for ${this.fileName} (extension "${this.extension}")`
  }
}
