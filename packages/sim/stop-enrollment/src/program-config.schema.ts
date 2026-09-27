import { Schema } from 'effect'

export const ProgramConfig = Schema.Struct({
  extends: Schema.String,
  files: Schema.Array(Schema.String),
  include: Schema.Array(Schema.String),
  references: Schema.Array(Schema.String),
})

export type ProgramConfig = Schema.Schema.Type<typeof ProgramConfig>
