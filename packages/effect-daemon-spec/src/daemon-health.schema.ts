import { Schema as S } from 'effect'

export class DynamicLimitExceeded extends S.TaggedError<DynamicLimitExceeded>()(
  'DynamicLimitExceeded',
  { limit: S.Int.pipe(S.greaterThanOrEqualTo(0)) },
) {}
