import { Schema } from 'effect'

export const OperationId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9_-]{22}$/)),
  Schema.brand('OperationId'),
)
export type OperationId = typeof OperationId.Type
