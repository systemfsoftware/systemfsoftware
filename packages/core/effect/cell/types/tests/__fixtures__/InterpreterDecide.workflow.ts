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
  Decoded,
  (decoded: Decoded): Result.Result<Admitted, Refused> =>
    Match.value(decoded.length > 3).pipe(
      Match.when(true, () => Result.succeed(new Admitted({ length: decoded.length }))),
      Match.when(false, () => Result.fail(new Refused({ why: 'too short' }))),
      Match.exhaustive,
    ),
)
