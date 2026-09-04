import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Decoded extends S.Class<Decoded>('Decoded')({
  length: S.Int,
}) {}

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/InterpreterDecide')
type DecisionTypeId = typeof DecisionTypeId

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
