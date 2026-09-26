import { Effect, Schema } from 'effect'

const tsdocMetadataBodyFromJson = Schema.fromJsonString(Schema.Json)

export interface TsdocMetadataFile {
  readonly preamble: readonly string[]
  readonly metadata: Schema.Json
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
