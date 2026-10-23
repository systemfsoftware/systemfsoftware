import { KeyDigest, TraceEntry } from '@systemfsoftware/effect-e2e/cache'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

export const WIRE_BYTES_CAP = 1_048_576

type JsonObject = Schema.JsonObject

const route = (path: string): JsonObject => ({ origin: 'https://shop.example', path, query: [] })

const entryJson = (path: string, alerts: ReadonlyArray<string>, schema = 'trace-1'): JsonObject => ({
  schema,
  keyedBy: {
    project: 'shop',
    test: 'checkout pays',
    target: 'staging',
    engine: { adapter: '@systemfsoftware/effect-e2e-web', kind: 'web' },
    app: 'shop',
    instruction: `open ${path}`,
    params: {},
    slots: [],
    agent: { name: 'default', contextDigest: '0'.repeat(64) },
  },
  start: route('/'),
  actions: [{ action: { _tag: 'Navigate', url: `https://shop.example${path}` }, controls: [] }],
  end: route(path),
  anchors: { appeared: [], gone: [] },
  checks: [],
  alerts,
  provenance: {
    engine: { adapter: '@systemfsoftware/effect-e2e-web', kind: 'web' },
    engineVersion: '1.0.0',
    model: { provider: 'openrouter', model: 'deepseek/deepseek-flash-latest' },
    agent: 'default',
    version: '1.0.0',
  },
})

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is JsonObject =>
  typeof value === 'object' && value !== null && !isJsonArray(value)

const canonicalOf = (value: Schema.Json): string =>
  isJsonArray(value)
    ? `[${value.map(canonicalOf).join(',')}]`
    : isJsonObject(value)
    ? `{${
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([key, field]) => `${JSON.stringify(key)}:${canonicalOf(field)}`)
        .join(',')
    }}`
    : JSON.stringify(value)

const utf8 = new TextEncoder()

export interface EntryFixture {
  readonly name: string
  readonly json: JsonObject
  readonly bytes: Uint8Array
}

const fixtureOf = (name: string, json: JsonObject): EntryFixture => ({
  name,
  json,
  bytes: utf8.encode(canonicalOf(json)),
})

const paddedTo = (name: string, bytes: number): EntryFixture => {
  const base = utf8.encode(canonicalOf(entryJson('/padded', ['']))).length
  return fixtureOf(name, entryJson('/padded', ['a'.repeat(bytes - base)]))
}

export const E1 = fixtureOf('E1', entryJson('/cart', []))
export const E2 = fixtureOf('E2', entryJson('/checkout', ['card declined once']))
export const E3 = fixtureOf('E3', entryJson('/receipt', ['r'.repeat(512 * 1024)]))
export const EXACT_CAP = paddedTo('exact-cap', WIRE_BYTES_CAP)
export const OVER_CAP = paddedTo('over-cap', WIRE_BYTES_CAP + 1)

export const D1 = KeyDigest.make('1'.repeat(64))
export const D2 = KeyDigest.make('2'.repeat(64))

export const NOT_JSON = utf8.encode('this is not a recording')

export const FOREIGN_SCHEMA = utf8.encode(canonicalOf(entryJson('/cart', [], 'trace-2')))

export const entryOf = (fixture: EntryFixture): Effect.Effect<TraceEntry> =>
  Effect.orDie(Schema.decodeUnknownEffect(TraceEntry)(fixture.json))

const known = [E1, E2, E3, EXACT_CAP, OVER_CAP]

const encodeEntry = Schema.encodeOption(Schema.toCodecJson(TraceEntry))

const decoder = new TextDecoder()

export const entryNameOf = (entry: TraceEntry): string =>
  Option.match(encodeEntry(entry), {
    onNone: () => 'unencodable',
    onSome: (json) => {
      const text = canonicalOf(json)
      return known.find((fixture) => decoder.decode(fixture.bytes) === text)?.name ?? `unknown ${text.slice(0, 80)}`
    },
  })

export const wireBytesOf = (entry: TraceEntry): Uint8Array =>
  Option.match(encodeEntry(entry), {
    onNone: () => new Uint8Array(),
    onSome: (json) => utf8.encode(canonicalOf(json)),
  })
