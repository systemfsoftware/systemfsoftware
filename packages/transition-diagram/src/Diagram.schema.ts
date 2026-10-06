import { Schema } from 'effect'

export const DiagramId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)),
  Schema.brand('@systemfsoftware/transition-diagram/DiagramId'),
)
export type DiagramId = typeof DiagramId.Type
