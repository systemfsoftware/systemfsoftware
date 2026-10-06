import { Schema } from 'effect'

/**
 * The defect every operation on a unit raises once the unit's work has ended. It is a named value,
 * not a message, so a test or a verdict matches the tag rather than parsing text.
 */
export class UnitEnded extends Schema.TaggedClass<UnitEnded>()('UnitEnded', {}) {}
