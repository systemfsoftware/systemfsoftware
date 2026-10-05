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

export const EffectPluginBlock = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.Literal('@effect/language-service'),
    diagnosticSeverity: Schema.optional(Schema.Record(Schema.String, Schema.Literal('error'))),
    allowedUnstableApis: Schema.optional(Schema.Array(Schema.String)),
    allowedExperimentalApis: Schema.optional(Schema.Array(Schema.String)),
    allowedDuplicatedPackages: Schema.optional(Schema.Array(Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
export type EffectPluginBlock = typeof EffectPluginBlock.Type
