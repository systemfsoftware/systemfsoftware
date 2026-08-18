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
export interface Refused {
  readonly kind: 'Refused'
  readonly why: string
  // The decide error channel must satisfy the tagged-channel rule the workflow brand rides
  // on, so it can be handed through `Workflow.make`. The tag is set by the fail literal;
  // the type declaration stays string-wide to keep this fixture out of the manual-tag rule.
  readonly _tag: string
}

export const decide = Workflow.make(
  (decoded: Decoded): Result.Result<Admitted, Refused> =>
    Match.value(decoded.length > 3).pipe(
      Match.when(true, () => Result.succeed<Admitted>({ kind: 'Admitted', length: decoded.length })),
      Match.when(false, () => Result.fail<Refused>({ kind: 'Refused', why: 'too short', _tag: 'Refused' })),
      Match.exhaustive,
    ),
)
