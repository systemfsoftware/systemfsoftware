import { Schema } from 'effect'

export const DiagramConfig = Schema.Struct({
  modules: Schema.NonEmptyArray(Schema.String),
  outDir: Schema.String,
})
export type DiagramConfig = typeof DiagramConfig.Type
