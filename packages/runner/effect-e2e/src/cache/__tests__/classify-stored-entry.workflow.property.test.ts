import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { CacheReadResult } from '../cache-store.schema.js'
import { ClassifyStoredEntry, classifyStoredEntry } from '../classify-stored-entry.workflow.js'
import { entryWireBytesOf, entryWireTextOf, TraceEntry } from '../entry.schema.js'

type Classify = typeof classifyStoredEntry

const WIRE_BYTES_CAP = 1_048_576

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

it.prop(
  '∀e_ClassifyStoredEntry_→OversizedPastCap',
  { of: [TraceEntry], subject: classifyStoredEntry, arbitrary: { seed: 500_002 } },
  (subject, [entry]) => {
    const exact = utf8.encode(wireOf(paddedTo(entry, WIRE_BYTES_CAP)))
    const over = utf8.encode(wireOf(paddedTo(entry, WIRE_BYTES_CAP + 1)))
    return exact.length === WIRE_BYTES_CAP &&
      over.length === WIRE_BYTES_CAP + 1 &&
      labelOf(readOf(subject, foundOf(exact))).startsWith('hit ') &&
      labelOf(readOf(subject, foundOf(over))) === 'invalid oversized'
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
