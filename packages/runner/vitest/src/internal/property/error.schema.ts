import * as Schema from 'effect/Schema'

/**
 * The generator's choice that refuted a property, as data: the seed and the shrink path fast-check recorded. The
 * renderer reads it off the failure value instead of parsing the message (KTD5).
 *
 * @internal
 */
export const PropertyReplay = Schema.Struct({
  seed: Schema.Finite,
  path: Schema.Array(Schema.Finite),
})

/**
 * A falsified property: the message the failure carries, and the generator's choice when the check result recorded
 * one, so the rerun line can replay it (KTD5).
 *
 * @internal
 */
export class PropertyRefuted extends Schema.TaggedError<PropertyRefuted>()('PropertyRefuted', {
  detail: Schema.String,
  replay: Schema.optional(PropertyReplay),
}) {
  override get message(): string {
    return this.detail
  }
}

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
