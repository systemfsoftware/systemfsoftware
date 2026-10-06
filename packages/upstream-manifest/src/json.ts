import { Effect, Match, Predicate, Result, Schema } from 'effect'
import { dual } from 'effect/Function'

import { Json } from './domain.schema.js'
import { GuardError } from './guard-error.schema.js'

/**
 * A codec whose decoded value is `A` and whose encoded side is `I` — the shape
 * every manifest, tsconfig and package file decodes through, from JSON text.
 */
export type JsonCodec<A, I = Json> = Schema.Codec<A, I>

/**
 * What the guard serializes and canonicalizes: any value `JSON.stringify`
 * accepts, including the `undefined` an optional property carries, so a decoded
 * domain value with optional fields can be written back without a cast.
 */
export type JsonInput =
  | null
  | boolean
  | number
  | string
  | undefined
  | ReadonlyArray<JsonInput>
  | { readonly [key: string]: JsonInput }

const decodeFailure = (message: string): GuardError => new GuardError({ message })

const decodeText = <A, I>(schema: JsonCodec<A, I>, text: string): Result.Result<A, GuardError> =>
  Result.mapError(
    Schema.decodeResult(Schema.fromJsonString(schema))(text),
    (error) => decodeFailure(error.message),
  )

/** Decode JSON text into a value on the Effect channel, refusing anything the schema refuses. */
export const parseJson = dual<
  (text: string) => <A, I>(schema: JsonCodec<A, I>) => Effect.Effect<A, GuardError>,
  <A, I>(schema: JsonCodec<A, I>, text: string) => Effect.Effect<A, GuardError>
>(
  2,
  <A, I>(schema: JsonCodec<A, I>, text: string): Effect.Effect<A, GuardError> =>
    Effect.fromResult(decodeText(schema, text)),
)

const isItems = (value: JsonInput): value is ReadonlyArray<JsonInput> => Array.isArray(value)

/** The one canonical guard for a JSON object value: `Predicate.isObject` minus arrays. */
export const isJsonObject = (value: JsonInput): value is Readonly<Record<string, JsonInput>> =>
  Predicate.isObject(value) && !Array.isArray(value)

const sortedEntries = (record: Readonly<Record<string, JsonInput>>): ReadonlyArray<readonly [string, JsonInput]> =>
  Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)).map(([key, inner]) => [key, sortKeys(inner)])

const sortKeys = (value: JsonInput): JsonInput =>
  Match.value(value).pipe(
    Match.when(isItems, (items) => items.map((item) => sortKeys(item))),
    Match.when(isJsonObject, (record) => Object.fromEntries(sortedEntries(record))),
    Match.orElse((scalar) => scalar),
  )

/** Serialize any JSON value as 2-space-indented text. */
export const stringifyJson = (value: JsonInput): string => JSON.stringify(value, null, 2)

/** A stable rendering of any value: object keys sorted, so two equal values compare equal. */
export const canonical = (value: JsonInput): string => JSON.stringify(sortKeys(value))

/** The `Json` codec, re-exported for callers that must widen a decoded value. */
export const JsonSchema = Json
