import { Array as Arr, Match, Option, Schema } from 'effect'
import { ConfigSeverity, type Entry } from './Entry.schema.js'
import { asRecord, objectEntries, type Raw, type RawObject } from './raw.js'

const DEBT_STRINGS: Readonly<Record<string, true>> = { off: true, allow: true, warn: true, '0': true, '1': true }
const DEBT_NUMBERS: Readonly<Record<number, true>> = { 0: true, 1: true }

const severityHead = (value: Raw): Raw => Array.isArray(value) ? value[0] : value

const isDebtSeverity = (value: Raw): boolean =>
  Match.value(severityHead(value)).pipe(
    Match.when((head: Raw): head is string => typeof head === 'string', (head) => DEBT_STRINGS[head] === true),
    Match.when((head: Raw): head is number => typeof head === 'number', (head) => DEBT_NUMBERS[head] === true),
    Match.orElse(() => false),
  )

const severityText = (value: Raw): string => String(severityHead(value))

const severityEntries = (
  file: string,
  channel: 'oxlint-rule' | 'oxlint-category',
  scope: string,
  value: Raw,
  files: ReadonlyArray<string>,
): ReadonlyArray<Entry> =>
  isDebtSeverity(value)
    ? [ConfigSeverity.make({ file, channel, scope, value: severityText(value), files: [...files] })]
    : []

const entriesOf = (record: RawObject, key: string): ReadonlyArray<readonly [string, Raw]> => objectEntries(record[key])

const overridesOf = (record: RawObject): ReadonlyArray<Raw> =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(record['overrides']), () => [])

const extendsOf = (record: RawObject): ReadonlyArray<Raw> =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(record['extends']), () => [])

const filesOf = (value: Raw): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.flatMap(
      asRecord(value),
      (record) => Schema.decodeUnknownOption(Schema.Array(Schema.String))(record['files']),
    ),
    () => [],
  )

export interface OxlintConfigFile {
  readonly file: string
  readonly value: Raw
  readonly resolveExtends?: (specifier: string, fromFile: string) => Option.Option<Raw>
}

function walkConfig(input: OxlintConfigFile, value: Raw, files: ReadonlyArray<string>): ReadonlyArray<Entry> {
  return Option.match(asRecord(value), {
    onNone: () => [],
    onSome: (record) => [
      ...Arr.flatMap(
        entriesOf(record, 'rules'),
        ([scope, severity]) => severityEntries(input.file, 'oxlint-rule', scope, severity, files),
      ),
      ...Arr.flatMap(
        entriesOf(record, 'categories'),
        ([scope, severity]) => severityEntries(input.file, 'oxlint-category', scope, severity, files),
      ),
      ...Arr.flatMap(overridesOf(record), (override) => walkConfig(input, override, overrideFiles(override, files))),
      ...Arr.flatMap(extendsOf(record), (extension) => walkExtends(input, extension, files)),
    ],
  })
}

const overrideFiles = (override: Raw, inherited: ReadonlyArray<string>): ReadonlyArray<string> =>
  filesOf(override).length === 0 ? inherited : filesOf(override)

const walkExtends = (
  input: OxlintConfigFile,
  value: Raw,
  files: ReadonlyArray<string>,
): ReadonlyArray<Entry> =>
  Match.value(value).pipe(
    Match.when(
      (candidate: Raw): candidate is string => typeof candidate === 'string',
      (specifier) =>
        Option.match(
          Option.flatMap(Option.fromNullishOr(input.resolveExtends), (resolve) => resolve(specifier, input.file)),
          {
            onNone: () => [],
            onSome: (resolved) => walkConfig(input, resolved, files),
          },
        ),
    ),
    Match.orElse((candidate) => walkConfig(input, candidate, files)),
  )

export const scanOxlintConfig = (input: OxlintConfigFile): ReadonlyArray<Entry> => walkConfig(input, input.value, [])
