import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

/**
 * The command fixtures the type tests pin `Workflow.make` against. They live in a
 * `*.schema.ts` because `schema-declaration-location` allows a module-scope schema
 * declaration only there or in the owning `<stem>.workflow.ts`, and because a
 * `.tst.ts` may hold no runtime value at all — the constraint is on the command
 * *value*, so the assertions need real constructors to point at.
 *
 * Only schema declarations belong here (`schema-file-exports-schemas-only`). The
 * negative fixtures — a plain class, an object literal, a primitive — are `declare`d
 * in the type test itself, where they cost no runtime value.
 */

/** The canonical authoring shape: a tagged command carrying its fields. */
export class TaggedCmd extends S.TaggedClass<TaggedCmd>()('TaggedCmd', {
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { value: 'tests.command.value' } as const
}

/** An untagged `Schema.Class`, which the constraint must accept on equal terms. */
export class UntaggedCmd extends S.Class<UntaggedCmd>('UntaggedCmd')({
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { value: 'tests.command.value' } as const
}

/** A schema class missing the static instrumentation stamp — refused by Workflow.make. */
export class UnstampedCmd extends S.Class<UnstampedCmd>('UnstampedCmd')({
  value: S.Int,
}) {}

/** A schema class whose instrumentation names a key that is not a field — refused by Workflow.make. */
export class BadKeyCmd extends S.Class<BadKeyCmd>('BadKeyCmd')({
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { nope: 'tests.command.nope' } as const
}

export class BadValueCmd extends S.Class<BadValueCmd>('BadValueCmd')({
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { value: 'tests.command.Value' } as const
}

/** A schema but not a class — no `identifier`, no `extend`, so it is refused. */
export const StructCmd = S.Struct({ value: S.Int })

/** An event list whose element carries no `_tag` — refused as a decision. */
export const UntaggedEventList = S.Array(StructCmd)

/** The tagged error channel `Inhabited` demands — tagged via the schema, never by hand. */
export class CommandRefused extends S.TaggedError<CommandRefused>()('CommandRefused', {
  why: S.String,
}) {}
