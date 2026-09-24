import * as Schema from 'effect/Schema'

/**
 * Thrown at file end when no property in the file refuted a subject's constant impostor (R12).
 *
 * @internal
 */
export class VacuousProperty extends Schema.TaggedError<VacuousProperty>()('VacuousProperty', {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}

/**
 * Thrown when a law kind is given a record `of`, which cannot be spread into its subject.
 *
 * @internal
 */
export class NonTupleOf extends Schema.TaggedError<NonTupleOf>()('NonTupleOf', {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}
