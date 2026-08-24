import * as S from 'effect/Schema'

import { ExitClass } from '../exit-classification.js'

/**
 * The coverage-to-mutant join failed.
 * Pure decision errors are internal — the caller supplies well-formed dry-run data.
 */
export class CoverageJoinError extends S.TaggedError<CoverageJoinError>()(
  'CoverageJoinError',
  {
    reason: S.String,
    cause: S.optional(S.Unknown),
    exitClass: S.Literal(ExitClass.InternalError),
  },
) {}
