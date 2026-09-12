import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import * as Workflow from './Workflow.js'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/cellLaws/Decision')
type DecisionTypeId = typeof DecisionTypeId

export class Decoded extends S.Class<Decoded>('Decoded')({
  length: S.Int,
}) {}

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {
  length: S.Number,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {
  why: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class Malformed extends S.TaggedError<Malformed>()('Malformed', {
  length: S.Int,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

/** Length decides: a negative length is undecidable, a length over three admits, anything else refuses. */
export const admitDecodedCommand = Workflow.make(
  Decoded,
  (decoded: Decoded): Result.Result<Admitted | Rejected, Malformed> =>
    Match.value(decoded.length < 0).pipe(
      Match.when(true, () => Result.fail(new Malformed({ length: decoded.length }))),
      Match.when(false, () =>
        Match.value(decoded.length > 3).pipe(
          Match.when(true, () => Result.succeed(new Admitted({ length: decoded.length }))),
          Match.when(false, () => Result.succeed(new Rejected({ why: 'too short' }))),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
)
