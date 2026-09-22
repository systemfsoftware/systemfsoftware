import { Schema } from 'effect'

export class ShapeRefusal extends Schema.TaggedError<ShapeRefusal>()('ShapeRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class CursorRefusal extends Schema.TaggedError<CursorRefusal>()('CursorRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export type MemoryFileSystemError = ShapeRefusal | CursorRefusal
