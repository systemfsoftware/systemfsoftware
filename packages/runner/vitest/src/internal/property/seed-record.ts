/**
 * @internal The seed store's pure decisions (KTD6, R16-R19): the codec a line is read through, the entries a
 * property claims, whether a failure is worth appending, and the replay a stored entry names. No file access
 * lives here — the shell `seed-store.ts` reads and appends lines, and the line grammar is `seed-store.schema.ts`.
 *
 * @since 4.0.0
 */
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { PlainPropertyReplay, type PropertyReplay, RefutedPropertyReplay } from '../../replay.schema.js'
import type { PropertyBudget } from './defaults.js'
import { SeedStoreUnreadable } from './error.schema.js'
import { ReplayToken } from './replay.schema.js'
import { type SeedStoreEntry, SeedStoreEntry as SeedStoreEntrySchema, SeedStoreLine } from './seed-store.schema.js'

const decodeLine = (
  file: string,
  index: number,
  text: string,
): Result.Result<SeedStoreEntry, SeedStoreUnreadable> =>
  Result.mapError(
    Schema.decodeResult(SeedStoreLine)(text),
    (error) => new SeedStoreUnreadable({ file, line: index + 1, detail: error.message }),
  )

/** @internal */
export const decodeStoreLines: {
  (file: string, lines: ReadonlyArray<string>): Result.Result<ReadonlyArray<SeedStoreEntry>, SeedStoreUnreadable>
  (lines: ReadonlyArray<string>): (file: string) => Result.Result<ReadonlyArray<SeedStoreEntry>, SeedStoreUnreadable>
} = Function.dual(
  2,
  (file: string, lines: ReadonlyArray<string>): Result.Result<ReadonlyArray<SeedStoreEntry>, SeedStoreUnreadable> =>
    Result.all(lines.map((text, index) => decodeLine(file, index, text))),
)

/** @internal */
export const entriesForProperty: {
  (entries: ReadonlyArray<SeedStoreEntry>, property: string): ReadonlyArray<SeedStoreEntry>
  (property: string): (entries: ReadonlyArray<SeedStoreEntry>) => ReadonlyArray<SeedStoreEntry>
} = Function.dual(
  2,
  (entries: ReadonlyArray<SeedStoreEntry>, property: string): ReadonlyArray<SeedStoreEntry> =>
    entries.filter((entry) => entry.property === property),
)

const sameEntry = (left: SeedStoreEntry, right: SeedStoreEntry): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const derandomized = (budget: PropertyBudget | undefined): boolean => budget?.seed !== undefined

const recordingOptedOut = (budget: PropertyBudget | undefined): boolean => budget?.record === false

const alreadyRecorded = (
  existing: ReadonlyArray<SeedStoreEntry>,
  candidate: SeedStoreEntry,
): boolean => existing.some((entry) => sameEntry(entry, candidate))

const not = (value: boolean): boolean => value === false

/** @internal */
export const shouldAppendEntry = (input: {
  readonly existing: ReadonlyArray<SeedStoreEntry>
  readonly candidate: SeedStoreEntry
  readonly budget: PropertyBudget | undefined
}): boolean =>
  [
    derandomized(input.budget),
    recordingOptedOut(input.budget),
    alreadyRecorded(input.existing, input.candidate),
  ].every(not)

/** @internal */
export const refutedEntryOf = (input: {
  readonly property: string
  readonly seed: number
  readonly token: string
}): Option.Option<SeedStoreEntry> =>
  Option.flatMap(
    Schema.decodeOption(ReplayToken)(input.token),
    (parts) =>
      Schema.decodeUnknownOption(SeedStoreEntrySchema)({
        _tag: 'Refuted',
        property: input.property,
        seed: input.seed,
        attempt: parts[2],
        size: parts[3],
        path: parts[4],
        failure: parts[5],
      }),
  )

/** @internal */
export const nonBooleanEntryOf = (input: {
  readonly property: string
  readonly seed: number
  readonly runs: number
}): Option.Option<SeedStoreEntry> =>
  Schema.decodeOption(SeedStoreEntrySchema)({
    _tag: 'NonBoolean',
    property: input.property,
    seed: input.seed,
    runs: input.runs,
  })

/** @internal */
export const replayEntryOf: {
  (entry: SeedStoreEntry, hash: number): Option.Option<PropertyReplay>
  (hash: number): (entry: SeedStoreEntry) => Option.Option<PropertyReplay>
} = Function.dual(
  2,
  (entry: SeedStoreEntry, hash: number): Option.Option<PropertyReplay> =>
    Match.value(entry).pipe(
      Match.tag('Refuted', (refuted) =>
        Schema.decodeOption(RefutedPropertyReplay)({
          _tag: 'Refuted',
          property: hash,
          seed: refuted.seed,
          runs: 1,
          attempt: refuted.attempt,
          size: refuted.size,
          path: refuted.path,
          failure: refuted.failure,
        })),
      Match.tag('NonBoolean', (plain) =>
        Schema.decodeOption(PlainPropertyReplay)({
          _tag: 'Plain',
          property: hash,
          seed: plain.seed,
          runs: plain.runs,
        })),
      Match.exhaustive,
    ),
)
