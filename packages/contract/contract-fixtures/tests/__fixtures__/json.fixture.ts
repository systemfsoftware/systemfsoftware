import { Effect, Schema } from 'effect'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export const decodeJsonText = (text: string): Effect.Effect<Schema.Json, Schema.SchemaError> =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(text)

export const asJsonValue = (value: Schema.Json): JsonValue =>
  value === null
    ? null
    : typeof value === 'object'
    ? Array.isArray(value)
      ? value.map(asJsonValue)
      : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, asJsonValue(entry)]))
    : value
