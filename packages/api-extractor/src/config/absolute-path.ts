import { Schema } from 'effect'
import * as Result from 'effect/Result'

import { InternalInvariantError } from '../errors/internal-invariant.schema.js'
import { AbsolutePath } from './absolute-path.schema.js'

/**
 * A resolved path, or the defect the run refuses. Every producer of a derived path — a join, a
 * dirname, an explicit setting — reads its verdict here rather than asserting the brand.
 */
export const absolutePathOf = (raw: string): Result.Result<AbsolutePath, InternalInvariantError> =>
  Result.mapError(
    Schema.decodeResult(AbsolutePath)(raw),
    (issue) =>
      new InternalInvariantError({
        message: `A resolved configuration path was not absolute: ${raw}`,
        cause: issue,
      }),
  )
