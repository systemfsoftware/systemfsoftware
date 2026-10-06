import { Schema } from 'effect'

export const DebtLedgerConfig = Schema.Struct({
  roots: Schema.NonEmptyArray(Schema.String),
  exclude: Schema.Array(Schema.String),
  mdPath: Schema.optional(Schema.String),
  jsonPath: Schema.optional(Schema.String),
  tsgoSchema: Schema.optional(Schema.String),
})
export type DebtLedgerConfig = typeof DebtLedgerConfig.Type
