import * as S from 'effect/Schema'

export class InstrumentError extends S.TaggedError<InstrumentError>()('InstrumentError', {
  message: S.String,
  cause: S.Unknown,
}) {}
