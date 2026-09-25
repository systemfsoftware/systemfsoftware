import * as Schema from 'effect/Schema'

export class Unavailable extends Schema.TaggedError<Unavailable>()('Unavailable', {}) {}
