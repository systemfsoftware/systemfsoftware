import { Schema } from 'effect'

export const ErrnoCause = Schema.Struct({
  code: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  dest: Schema.optional(Schema.String),
  syscall: Schema.optional(Schema.String),
  message: Schema.String,
})
export type ErrnoCause = typeof ErrnoCause.Type
