import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { TraceEntry } from './entry.schema.js'

export const decodeTraceEntry = (input: Schema.Json): Effect.Effect<TraceEntry, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(TraceEntry, { onExcessProperty: 'error' })(input)

const entryDecodes = (input: Schema.Json): boolean => decodeTraceEntry(input).pipe(Effect.runSyncExit, Exit.isSuccess)

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value)

const encodedObjectOf = (entry: TraceEntry): Option.Option<Schema.JsonObject> =>
  Result.match(Schema.encodeResult(Schema.toCodecJson(TraceEntry))(entry), {
    onFailure: Option.none,
    onSuccess: (encoded) => isJsonObject(encoded) ? Option.some(encoded) : Option.none(),
  })

const withExtraKey = (encoded: Schema.JsonObject, key: string, value: string): Schema.JsonObject =>
  Object.assign({}, encoded, { [key]: value })

const withForeignSchema = (encoded: Schema.JsonObject, suffix: string): Schema.JsonObject =>
  Object.assign({}, encoded, { schema: `trace-1${suffix}#` })

const excessKeyRefused = (decodes: typeof entryDecodes, encoded: Schema.JsonObject, key: string): boolean =>
  decodes(encoded) && !decodes(withExtraKey(encoded, key, key))

const foreignSchemaRefused = (decodes: typeof entryDecodes, encoded: Schema.JsonObject, suffix: string): boolean =>
  decodes(encoded) && !decodes(withForeignSchema(encoded, suffix))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀e_TraceEntry_¬ExcessPropertyAccepted',
    { of: [TraceEntry, Schema.String], subject: entryDecodes, runs: 100, arbitrary: { seed: 498_014 } },
    (subject, [entry, name]) =>
      Option.match(encodedObjectOf(entry), {
        onNone: () => false,
        onSome: (encoded) => excessKeyRefused(subject, encoded, `x-${name}`),
      }),
  )

  it.prop(
    '∀e_TraceEntry_¬ForeignSchemaAccepted',
    { of: [TraceEntry, Schema.String], subject: entryDecodes, runs: 100, arbitrary: { seed: 498_015 } },
    (subject, [entry, suffix]) =>
      Option.match(encodedObjectOf(entry), {
        onNone: () => false,
        onSome: (encoded) => foreignSchemaRefused(subject, encoded, suffix),
      }),
  )
}
