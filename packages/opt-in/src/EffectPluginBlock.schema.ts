import { Schema } from 'effect'

export const PresetManifest = Schema.Struct({
  exports: Schema.Record(Schema.String, Schema.Unknown),
})
export type PresetManifest = typeof PresetManifest.Type

export const PluggablePreset = Schema.Struct({
  compilerOptions: Schema.optional(
    Schema.Struct({
      plugins: Schema.optional(Schema.Array(Schema.Unknown)),
    }),
  ),
})

export const DiagnosticSeverity = Schema.Literals(['off', 'error', 'warning', 'message', 'suggestion'])
export type DiagnosticSeverity = typeof DiagnosticSeverity.Type

export const EffectPluginOverrideOptions = Schema.StructWithRest(
  Schema.Struct({
    diagnosticSeverity: Schema.optional(Schema.Record(Schema.String, DiagnosticSeverity)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
export type EffectPluginOverrideOptions = typeof EffectPluginOverrideOptions.Type

export const EffectPluginOverride = Schema.StructWithRest(
  Schema.Struct({
    include: Schema.optional(Schema.Array(Schema.String)),
    exclude: Schema.optional(Schema.Array(Schema.String)),
    options: Schema.optional(EffectPluginOverrideOptions),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
export type EffectPluginOverride = typeof EffectPluginOverride.Type

export const EffectPluginBlock = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.Literal('@effect/language-service'),
    diagnosticSeverity: Schema.optional(Schema.Record(Schema.String, Schema.Literal('error'))),
    allowedUnstableApis: Schema.optional(Schema.Array(Schema.String)),
    allowedExperimentalApis: Schema.optional(Schema.Array(Schema.String)),
    allowedDuplicatedPackages: Schema.optional(Schema.Array(Schema.String)),
    overrides: Schema.optional(Schema.Array(EffectPluginOverride)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
export type EffectPluginBlock = typeof EffectPluginBlock.Type
