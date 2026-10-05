import { Schema } from 'effect'

export const TsgoSchema = Schema.Struct({
  definitions: Schema.Struct({
    effectLanguageServicePluginDiagnosticSeverityDefinition: Schema.Struct({
      properties: Schema.Record(Schema.String, Schema.Unknown),
    }),
  }),
})
export type TsgoSchema = typeof TsgoSchema.Type
