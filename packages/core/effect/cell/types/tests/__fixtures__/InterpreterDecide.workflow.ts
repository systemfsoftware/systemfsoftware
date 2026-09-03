import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

/**
 * The decoded command. An untagged `Schema.Class`, so the interpreter's decode
 * phase keeps returning a plain record: the constraint `Workflow.make` applies is
 * on the command argument it receives, not on what decode produces.
 *
 * Declared here because this is the owning single-segment `<stem>.workflow.ts`,
 * which `schema-declaration-location` admits.
 */
export class Decoded extends S.Class<Decoded>('Decoded')({
  length: S.Int,
}) {}

/**
 * The decide channels, declared as schema classes. A refusal is a decision outcome
 * in the Cell's semantics — the write phase receives it — so it lives on the
 * decision channel as `Rejected`; the decider's genuine failure mode is a command
 * it cannot decide at all: a negative length is an undecidable command for a
 * length classification, refused as `Malformed`.
 *
 * The two decision variants share one family brand, as the success-channel
 * constraint demands: `Workflow.make` refuses a decision channel that is not a
 * tagged union of at least two schema tagged classes carrying the same TypeId.
 */
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

export const decide = Workflow.make(
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
