import { Schema } from 'effect'

export const WorkflowSchemasLike = Schema.Struct({
  command: Schema.Unknown,
  decision: Schema.Unknown,
  error: Schema.Unknown,
})
export type WorkflowSchemasLike = typeof WorkflowSchemasLike.Type
