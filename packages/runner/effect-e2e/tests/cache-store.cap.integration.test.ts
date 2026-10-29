import {
  CacheReadResult,
  CacheStorageFailed,
  CacheWriteResult,
  KeyDigest,
  MemoryCacheStore,
  TraceEntry,
} from '@systemfsoftware/effect-e2e/cache'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'

const Feature = makeFeature({ it })

/** The spec constant the store's own cap must agree with, kept here so the tests never import it. */
const WIRE_BYTES_CAP = 1_048_576

const utf8 = new TextEncoder()

const D1 = KeyDigest.make('1'.repeat(64))

const route = (path: string): Schema.JsonObject => ({ origin: 'https://shop.example', path, query: [] })

const entryJson = (path: string, alerts: ReadonlyArray<string>): Schema.JsonObject => ({
  schema: 'trace-1',
  keyedBy: {
    step: 'act',
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

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  typeof value === 'object' && value !== null && !isJsonArray(value)

/** Canonical wire text built here, never through the production encoder. */
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

const entryAtBytes = (bytes: number): Schema.JsonObject => {
  const base = utf8.encode(canonicalOf(entryJson('/padded', ['']))).length
  return entryJson('/padded', ['a'.repeat(bytes - base)])
}

const EXACT_CAP = entryAtBytes(WIRE_BYTES_CAP)
const OVER_CAP = entryAtBytes(WIRE_BYTES_CAP + 1)

const entryOf = (json: Schema.JsonObject): Effect.Effect<TraceEntry> =>
  Effect.orDie(Schema.decodeUnknownEffect(TraceEntry)(json))

const readLabel = (read: CacheReadResult): string =>
  Match.valueTags(read, {
    Hit: () => 'Hit',
    Miss: () => 'Miss',
    Invalid: ({ reason }) => `Invalid(${reason})`,
  })

const writeLabel = (write: Effect.Effect<CacheWriteResult, CacheStorageFailed>): Effect.Effect<string> =>
  Effect.match(write, {
    onFailure: (failure) => `CacheStorageFailed(${failure.message})`,
    onSuccess: CacheWriteResult.match({
      Written: () => 'Written',
      ReadOnly: () => 'ReadOnly',
      Oversized: () => 'Oversized',
    }),
  })

Feature('The wire byte cap at the cache store boundary')
  .withLayer(Layer.empty)
  .live('the scenarios run the real admit and classify workflows over an in-memory store')
  .body(({ scenario }) => {
    scenario(
      'An entry of exactly the wire byte cap is admitted, and its bytes are exactly the cap',
      Gherkin.Do.pipe(
        Given('a read-write memory store')('store', () => MemoryCacheStore.make({ mode: 'read-write' })),
        When('the exact-cap entry is written under a fresh digest')(
          'write',
          ({ store }) => Effect.flatMap(entryOf(EXACT_CAP), (entry) => writeLabel(store.write(D1, entry))),
        ),
        Then('the store admits it, and the entry is exactly 1048576 bytes')((state, expect) =>
          expect([state.write, utf8.encode(canonicalOf(EXACT_CAP)).length]).toEqual(['Written', WIRE_BYTES_CAP])
        ),
      ),
    )

    scenario(
      'An entry one byte past the wire byte cap is refused as oversized',
      Gherkin.Do.pipe(
        Given('a read-write memory store')('store', () => MemoryCacheStore.make({ mode: 'read-write' })),
        When('the over-cap entry is written under a fresh digest')(
          'write',
          ({ store }) => Effect.flatMap(entryOf(OVER_CAP), (entry) => writeLabel(store.write(D1, entry))),
        ),
        Then('the store refuses it, and the entry is exactly 1048577 bytes')((state, expect) =>
          expect([state.write, utf8.encode(canonicalOf(OVER_CAP)).length]).toEqual(['Oversized', WIRE_BYTES_CAP + 1])
        ),
      ),
    )

    scenario(
      'A stored entry of exactly the wire byte cap is a hit',
      Gherkin.Do.pipe(
        Given('a read-write memory store seeded with the exact-cap bytes')(
          'store',
          () =>
            MemoryCacheStore.make({
              mode: 'read-write',
              seed: new Map([[D1, utf8.encode(canonicalOf(EXACT_CAP))]]),
            }),
        ),
        When('the store reads that digest')('read', ({ store }) => Effect.map(store.read(D1), readLabel)),
        Then('the entry replays as a hit, and the stored bytes are exactly the cap')((state, expect) =>
          expect([state.read, utf8.encode(canonicalOf(EXACT_CAP)).length]).toEqual(['Hit', WIRE_BYTES_CAP])
        ),
      ),
    )

    scenario(
      'A stored entry one byte past the wire byte cap is invalid oversized',
      Gherkin.Do.pipe(
        Given('a read-write memory store seeded with the over-cap bytes')(
          'store',
          () =>
            MemoryCacheStore.make({
              mode: 'read-write',
              seed: new Map([[D1, utf8.encode(canonicalOf(OVER_CAP))]]),
            }),
        ),
        When('the store reads that digest')('read', ({ store }) => Effect.map(store.read(D1), readLabel)),
        Then('the entry reads back as invalid oversized, and the stored bytes are exactly cap plus one')((
          state,
          expect,
        ) =>
          expect([state.read, utf8.encode(canonicalOf(OVER_CAP)).length]).toEqual([
            'Invalid(oversized)',
            WIRE_BYTES_CAP + 1,
          ])
        ),
      ),
    )
  })
