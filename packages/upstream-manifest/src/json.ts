import { Effect, Match, Predicate, Result, Schema } from 'effect'

import { Json, type Json as JsonValue } from './domain.schema.js'
import { GuardError } from './guard-error.js'

/** Decode JSON text into a value on the Effect channel, refusing anything the schema refuses. */
export const decodeJson = <A>(schema: Schema.Schema<A>, text: string): Effect.Effect<A, GuardError> =>
  Result.match(Schema.decodeResult(Schema.fromJsonString(schema))(text), {
    onSuccess: (value) => Effect.succeed(value),
    onFailure: (error) => Effect.fail(new GuardError({ message: error.message })),
  })

const ESCAPES: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
}

const controlEscape = (character: string): string => {
  const code = character.codePointAt(0) ?? 0
  return code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : character
}

const escapeChar = (character: string): string => ESCAPES[character] ?? controlEscape(character)

const escapeString = (text: string): string => [...text].map(escapeChar).join('')

const indented = (lines: ReadonlyArray<string>, indent: string): string =>
  lines.length === 0 ? '' : `\n${lines.map((line) => `${indent}  ${line}`).join(',\n')}\n${indent}`

const renderArray = (items: ReadonlyArray<JsonValue>, indent: string): string =>
  items.length === 0 ? '[]' : `[${indented(items.map((item) => render(item, `${indent}  `)), indent)}]`

const renderObject = (record: { readonly [key: string]: JsonValue }, indent: string): string => {
  const entries = Object.entries(record)
  return entries.length === 0
    ? '{}'
    : `{${indented(entries.map(([key, item]) => `"${escapeString(key)}": ${render(item, `${indent}  `)}`), indent)}}`
}

const render = (value: JsonValue, indent: string): string =>
  Match.value(value).pipe(
    Match.when(Predicate.isNull, () => 'null'),
    Match.when((inner): inner is string => typeof inner === 'string', (text) => `"${escapeString(text)}"`),
    Match.when(
      (inner): inner is number | boolean => typeof inner === 'number' || typeof inner === 'boolean',
      (scalar) => `${scalar}`,
    ),
    Match.when(Array.isArray, (items) => renderArray(items, indent)),
    Match.orElse((record) => renderObject(record, indent)),
  )

/** Serialize a value as 2-space-indented JSON, without reaching for `JSON.stringify`. */
export const stringifyJson = (value: JsonValue): string => render(value, '')

const sortKeys = (value: JsonValue): JsonValue =>
  Match.value(value).pipe(
    Match.when(Array.isArray, (items) => items.map(sortKeys)),
    Match.when(Predicate.isObject, (record) =>
      Object.fromEntries(
        Object.entries(record)
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([key, inner]) => [key, sortKeys(inner)]),
      )),
    Match.orElse((scalar) => scalar),
  )

/** A stable rendering of any value: object keys sorted, so two equal values compare equal. */
export const canonical = (value: JsonValue): string => stringifyJson(sortKeys(value))

/** The `Json` codec, re-exported for callers that must widen a decoded value. */
export const JsonSchema = Json
