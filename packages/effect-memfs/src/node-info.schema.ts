import * as Schema from 'effect/Schema'

export class ShapeRefusal extends Schema.TaggedError<ShapeRefusal>()('ShapeRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
