import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

export interface Decoded {
  readonly length: number
}
export interface Admitted {
  readonly kind: 'Admitted'
  readonly length: number
}
const RefusedTag = { _tag: 'Refused' } as const
type RefusedTag = typeof RefusedTag

/**
 * The decide error channel must carry a `_tag` the consumer can dispatch on,
 * which the branded `Workflow.make` demands. The tag is inherited from the
 * carrier above rather than declared here, and the same carrier is spread into
 * the failure value, so the literal has exactly one source.
 */
export interface Refused extends RefusedTag {
  readonly kind: 'Refused'
  readonly why: string
}

export const decide = Workflow.make(
  (decoded: Decoded): Result.Result<Admitted, Refused> =>
    Match.value(decoded.length > 3).pipe(
      Match.when(true, () => Result.succeed<Admitted>({ kind: 'Admitted', length: decoded.length })),
      Match.when(false, () => Result.fail<Refused>({ ...RefusedTag, kind: 'Refused', why: 'too short' })),
      Match.exhaustive,
    ),
)
