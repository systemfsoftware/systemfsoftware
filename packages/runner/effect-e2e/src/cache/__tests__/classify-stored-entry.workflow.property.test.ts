import { it } from '@systemfsoftware/vitest'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { CacheReadResult } from '../cache-store.schema.js'
import { ClassifyStoredEntry, classifyStoredEntry } from '../classify-stored-entry.workflow.js'
import { entryWireBytesOf, entryWireTextOf, TraceEntry } from '../entry.schema.js'

type Classify = typeof classifyStoredEntry

const utf8 = new TextEncoder()

const readOf = (classify: Classify, command: ClassifyStoredEntry): CacheReadResult =>
  Result.match(classify(command), { onFailure: (missing: never) => missing, onSuccess: (read) => read })

const foundOf = (bytes: Uint8Array): ClassifyStoredEntry => new ClassifyStoredEntry({ found: { _tag: 'Found', bytes } })

const labelOf = (read: CacheReadResult): string =>
  Match.valueTags(read, {
    Hit: ({ entry }) => `hit ${Option.getOrElse(entryWireTextOf(entry), () => 'unencodable')}`,
    Miss: () => 'miss',
    Invalid: ({ reason }) => `invalid ${reason}`,
  })

const wireOf = (entry: TraceEntry): string => Option.getOrElse(entryWireTextOf(entry), () => '')

const WIRE_BYTES_CAP = 1_048_576

const withAlerts = (entry: TraceEntry, alerts: ReadonlyArray<string>): TraceEntry => ({ ...entry, alerts })

const paddedTo = (entry: TraceEntry, bytes: number): TraceEntry => {
  const slim = withAlerts(entry, [])
  return withAlerts(slim, ['a'.repeat(bytes - entryWireBytesOf(slim) - 2)])
}

it.prop(
  '∀e_ClassifyStoredEntry_≡HitRoundTripsWireText',
  { of: [TraceEntry], subject: classifyStoredEntry, arbitrary: { seed: 500_001 } },
  (subject, [entry]) => labelOf(readOf(subject, foundOf(utf8.encode(wireOf(entry))))) === `hit ${wireOf(entry)}`,
)

const SWEEP_BOUND = 16

/** Folds a drawn integer onto a size offset in -SWEEP_BOUND..SWEEP_BOUND, so every draw lands near the cap. */
const offsetOf = (n: number): number => {
  const span = 2 * SWEEP_BOUND + 1
  return (((n % span) + span) % span) - SWEEP_BOUND
}

const templateEntry = Effect.runSync(
  Schema.decodeEffect(TraceEntry)({
    schema: 'trace-1',
    keyedBy: {
      step: 'act',
      project: 'shop',
      test: 'checkout pays',
      target: 'staging',
      engine: { adapter: '@systemfsoftware/effect-e2e-web', kind: 'web' },
      app: 'shop',
      instruction: 'open /cart',
      params: {},
      slots: [],
      agent: { name: 'default', contextDigest: '0'.repeat(64) },
    },
    start: { origin: 'https://shop.example', path: '/', query: [] },
    actions: [],
    end: { origin: 'https://shop.example', path: '/cart', query: [] },
    anchors: { appeared: [], gone: [] },
    checks: [],
    alerts: [],
    provenance: {
      engine: { adapter: '@systemfsoftware/effect-e2e-web', kind: 'web' },
      engineVersion: '1.0.0',
      model: { provider: 'openrouter', model: 'deepseek/deepseek-flash-latest' },
      agent: 'default',
      version: '1.0.0',
    },
  }),
)

it.prop(
  '∀n_ClassifyStoredEntry_≤WireCap',
  {
    of: [Schema.Int],
    subject: classifyStoredEntry,
    cover: {
      BelowCap: [(n: number) => offsetOf(n) < 0, 0.3],
      AtCap: [(n: number) => offsetOf(n) === 0, 0.02],
      AboveCap: [(n: number) => offsetOf(n) > 0, 0.3],
    },
    arbitrary: { seed: 500_002 },
  },
  (subject, [n]) => {
    const bytes = utf8.encode(wireOf(paddedTo(templateEntry, WIRE_BYTES_CAP + offsetOf(Number(n)))))
    return Match.valueTags(readOf(subject, foundOf(bytes)), {
      Hit: () => bytes.length <= WIRE_BYTES_CAP,
      Invalid: () => bytes.length > WIRE_BYTES_CAP,
      Miss: () => false,
    })
  },
)

it.prop(
  '∀s_ClassifyStoredEntry_→NotTrace1OnArbitraryText',
  { of: [Schema.String], subject: classifyStoredEntry, arbitrary: { seed: 500_005 } },
  (subject, [text]) => labelOf(readOf(subject, foundOf(utf8.encode(text)))) === 'invalid not-trace-1',
)

it.prop(
  '∀e_ClassifyStoredEntry_→NotTrace1OnInvalidUtf8',
  { of: [TraceEntry], subject: classifyStoredEntry, arbitrary: { seed: 500_006 } },
  (subject, [entry]) =>
    labelOf(readOf(subject, foundOf(Uint8Array.of(0xff, ...utf8.encode(wireOf(entry)))))) === 'invalid not-trace-1',
)

it.prop(
  '∀s_ClassifyStoredEntry_≡UnreadableKeepsItsMessage',
  { of: [Schema.String], subject: classifyStoredEntry, arbitrary: { seed: 500_007 } },
  (subject, [message]) =>
    Match.valueTags(readOf(subject, new ClassifyStoredEntry({ found: { _tag: 'Unreadable', message } })), {
      Hit: () => false,
      Miss: () => false,
      Invalid: (invalid) => invalid.reason === 'unreadable' && invalid.message === message,
    }),
)
