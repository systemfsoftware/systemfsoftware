import { Schema } from 'effect'
import { PortBinding } from './Port.schema.js'

export const ProbeTarget = Schema.Struct({
  bindings: Schema.Array(PortBinding),
  timeoutMs: Schema.Int,
  pollMs: Schema.Int,
})
export type ProbeTarget = typeof ProbeTarget.Type
