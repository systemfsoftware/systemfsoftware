import * as Schema from 'effect/Schema'

export const NamedManifest = Schema.fromJsonString(Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) }))

const Dependencies = Schema.Record(Schema.String, Schema.String)

export const CliManifest = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.String,
    dependencies: Dependencies,
    peerDependencies: Dependencies,
  }),
)
export type CliManifest = typeof CliManifest.Type
