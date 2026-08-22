import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export interface Decoded {
  readonly length: number
}

/**
 * The decide channels, declared as schema classes: the decision is a
 * `TaggedClass` and the refusal a `TaggedError`. Both carry the `_tag` the
 * branded `Workflow.make` demands of an error channel without any member being
 * hand-written, and neither needs the second hand-rolled discriminant the `kind`
 * field used to be.
 */
export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {
  length: S.Number,
}) {}

export class Refused extends S.TaggedError<Refused>()('Refused', {
  why: S.String,
}) {}

export const decide = Workflow.make(
  (decoded: Decoded): Result.Result<Admitted, Refused> =>
    Match.value(decoded.length > 3).pipe(
      Match.when(true, () => Result.succeed(new Admitted({ length: decoded.length }))),
      Match.when(false, () => Result.fail(new Refused({ why: 'too short' }))),
      Match.exhaustive,
    ),
)
