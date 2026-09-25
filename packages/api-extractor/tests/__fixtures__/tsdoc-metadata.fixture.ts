import { Effect, Schema } from 'effect'

const TsdocMetadataBody = Schema.Struct({
  tsdocVersion: Schema.String,
  toolPackages: Schema.Array(
    Schema.Struct({
      packageName: Schema.String,
      packageVersion: Schema.String,
    }),
  ),
})

const tsdocMetadataBodyFromJson = Schema.fromJsonString(TsdocMetadataBody)

export interface TsdocMetadataFile {
  readonly preamble: readonly string[]
  readonly metadata: typeof TsdocMetadataBody.Type
}

export const readTsdocMetadata = (
  text: string,
): Effect.Effect<TsdocMetadataFile, Schema.SchemaError> => {
  const lines = text.split('\n')
  return Effect.map(
    Schema.decodeEffect(tsdocMetadataBodyFromJson)(lines.slice(2).join('\n')),
    (metadata): TsdocMetadataFile => ({ preamble: lines.slice(0, 2), metadata }),
  )
}
