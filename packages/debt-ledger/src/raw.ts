import { Match, Option, Schema } from 'effect'

export type Raw = (typeof Schema.Unknown)['Type']
export type RawObject = Readonly<Record<string, Raw>>

const isRawObject = (value: Raw): value is RawObject =>
  Match.value(value).pipe(
    Match.when((candidate: Raw) => typeof candidate !== 'object', () => false),
    Match.when((candidate: Raw) => candidate === null, () => false),
    Match.when((candidate: Raw) => Array.isArray(candidate), () => false),
    Match.orElse(() => true),
  )

export const asRecord = (value: Raw): Option.Option<RawObject> =>
  Match.value(value).pipe(
    Match.when(isRawObject, (record) => Option.some(record)),
    Match.orElse(() => Option.none()),
  )

export const objectEntries = (value: Raw): ReadonlyArray<readonly [string, Raw]> =>
  Option.getOrElse(
    Option.map(asRecord(value), (record) => Object.entries(record)),
    (): ReadonlyArray<readonly [string, Raw]> => [],
  )
