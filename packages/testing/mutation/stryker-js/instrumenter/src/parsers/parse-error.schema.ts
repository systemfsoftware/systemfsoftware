import * as S from 'effect/Schema'

export class ParseFailed extends S.TaggedError<ParseFailed>()('ParseFailed', {
  fileName: S.String,
  message: S.String,
  location: S.Struct({ line: S.Finite, column: S.Finite }),
  cause: S.Unknown,
}) {
  readonly exitClass = 'ParseFailed' as const
}

export class ParserNotFound extends S.TaggedError<ParserNotFound>()('ParserNotFound', {
  fileName: S.String,
  extension: S.String,
  cause: S.Unknown,
}) {
  readonly exitClass = 'ParserNotFound' as const
}
