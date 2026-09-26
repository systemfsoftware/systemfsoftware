import { Schema } from 'effect'

export const SchemaViolation = Schema.Struct({
  instancePath: Schema.String,
  message: Schema.String,
})
export type SchemaViolation = typeof SchemaViolation.Type

export const SchemaAstView = Schema.Struct({
  _tag: Schema.String,
  types: Schema.optional(Schema.Array(Schema.Struct({ _tag: Schema.String }))),
})
export type SchemaAstView = typeof SchemaAstView.Type

export const ConfigIssueKind = Schema.Literals(['UnexpectedKey', 'MissingKey', 'InvalidType', 'AnyOf'])
export type ConfigIssueKind = typeof ConfigIssueKind.Type
