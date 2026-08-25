import * as S from 'effect/Schema'

export class HybridFileNotFoundError extends S.TaggedError<HybridFileNotFoundError>()(
  'HybridFileNotFoundError',
  {
    fileName: S.String,
  },
) {}
