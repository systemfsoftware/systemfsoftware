import { parse as parseJsonc } from '@std/jsonc'
import { Array as Arr, Option, Schema } from 'effect'
import { ConfigSeverity, type Entry, type Role } from './Entry.schema.js'
import { asRecord, objectEntries, type Raw, type RawObject } from './raw.js'

export interface TsconfigFile {
  readonly file: string
  readonly path: string
  readonly text: string
  readonly readText: (path: string) => Option.Option<string>
  readonly resolveExtends: (specifier: string, fromDir: string) => Option.Option<string>
  readonly tsgoDefaults: ReadonlyArray<readonly [string, string]>
}

const MAX_DEPTH = 32
const LIBRARY_SPEC = '@systemfsoftware/tsconfig/effect'
const TEST_SPEC = '@systemfsoftware/tsconfig/effect/entrypoint'
const LIBRARY_ROLE: Role = 'library'
const TEST_ROLE: Role = 'test'

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const parseTsconfig = (text: string): Option.Option<RawObject> =>
  Option.flatMap(Option.fromNullishOr(parseJsonc(text)), asRecord)

const libraryRole = (spec: string): Option.Option<Role> =>
  spec === LIBRARY_SPEC ? Option.some(LIBRARY_ROLE) : Option.none()

const roleFromSpecifier = (spec: string): Option.Option<Role> =>
  spec === TEST_SPEC ? Option.some(TEST_ROLE) : libraryRole(spec)

const stringArray = (value: Raw): ReadonlyArray<string> =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Array(Schema.String))(value), (): ReadonlyArray<string> => [])

const stringValue = (value: Raw): Option.Option<string> => Schema.decodeUnknownOption(Schema.String)(value)

const specifiersOf = (record: RawObject): ReadonlyArray<string> =>
  Option.match(stringValue(record['extends']), {
    onSome: (value) => [value],
    onNone: () => stringArray(record['extends']),
  })

const pluginBlock = (record: RawObject): Option.Option<RawObject> =>
  Option.flatMap(asRecord(record['compilerOptions']), (options) =>
    Option.flatMap(
      Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(options['plugins']),
      (plugins) =>
        Arr.findFirst(
          plugins,
          (plugin) =>
            Option.getOrElse(
              Option.map(asRecord(plugin), (block) => block['name'] === '@effect/language-service'),
              () => false,
            ),
        ).pipe(Option.flatMap(asRecord)),
    ))

interface Resolved {
  readonly record: RawObject
  readonly dir: string
}

const resolveOne = (input: TsconfigFile, spec: string, dir: string): Option.Option<Resolved> =>
  Option.flatMap(
    input.resolveExtends(spec, dir),
    (path) =>
      Option.flatMap(input.readText(path), (text) =>
        Option.map(parseTsconfig(text), (record) => ({ record, dir: dirOf(path) }))),
  )

const firstPresent = <A>(options: ReadonlyArray<Option.Option<A>>): Option.Option<A> =>
  Arr.findFirst(options, Option.isSome).pipe(Option.flatten)

const effectiveBlock = (
  input: TsconfigFile,
  record: RawObject,
  dir: string,
  depth: number,
): Option.Option<RawObject> =>
  Option.orElse(pluginBlock(record), () =>
    depth <= 0
      ? Option.none()
      : firstPresent(
        Arr.map(specifiersOf(record), (spec) =>
          Option.flatMap(
            resolveOne(input, spec, dir),
            (parent) => effectiveBlock(input, parent.record, parent.dir, depth - 1),
          )),
      ))

const roleOf = (input: TsconfigFile, record: RawObject, dir: string, depth: number): Option.Option<Role> =>
  Option.orElse(firstPresent(Arr.map(specifiersOf(record), roleFromSpecifier)), () =>
    depth <= 0
      ? Option.none()
      : firstPresent(
        Arr.map(specifiersOf(record), (spec) =>
          Option.flatMap(resolveOne(input, spec, dir), (parent) =>
            roleOf(input, parent.record, parent.dir, depth - 1))),
      ))

const mergedSeverities = (
  defaults: ReadonlyArray<readonly [string, string]>,
  block: Option.Option<RawObject>,
): ReadonlyMap<string, string> => {
  const merged = new Map(defaults)
  Option.match(block, {
    onNone: () => undefined,
    onSome: (value) =>
      Arr.forEach(objectEntries(value['diagnosticSeverity']), ([name, severity]) => merged.set(name, String(severity))),
  })
  return merged
}

const diagnosticEntries = (
  file: string,
  role: Role,
  merged: ReadonlyMap<string, string>,
): ReadonlyArray<Entry> =>
  Arr.flatMap(
    [...merged],
    ([scope, value]) =>
      value === 'error'
        ? []
        : [ConfigSeverity.make({ file, channel: 'tsgo-diagnostic', scope, value, files: [], role })],
  )

const overrideSeverities = (record: RawObject): ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> =>
  Arr.flatMap(
    Option.getOrElse(
      Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(record['overrides']),
      (): ReadonlyArray<Raw> => [],
    ),
    (override) =>
      Option.match(asRecord(override), {
        onNone: (): ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> => [],
        onSome: (entry) => {
          const files = stringArray(entry['include'])
          return Option.match(
            Option.flatMap(asRecord(entry['options']), (options) => asRecord(options['diagnosticSeverity'])),
            {
              onNone: (): ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> => [],
              onSome: (severities) =>
                Arr.map(
                  objectEntries(severities),
                  (
                    [scope, severity],
                  ): readonly [string, string, ReadonlyArray<string>] => [scope, String(severity), files],
                ),
            },
          )
        },
      }),
  )

const overrideEntries = (file: string, role: Role, block: Option.Option<RawObject>): ReadonlyArray<Entry> =>
  Option.match(block, {
    onNone: (): ReadonlyArray<Entry> => [],
    onSome: (value) =>
      Arr.flatMap(
        overrideSeverities(value),
        ([scope, severity, files]): ReadonlyArray<Entry> =>
          severity === 'error'
            ? []
            : [ConfigSeverity.make({ file, channel: 'tsgo-diagnostic', scope, value: severity, files, role })],
      ),
  })

export const scanTsconfigFile = (input: TsconfigFile): ReadonlyArray<Entry> =>
  Option.match(parseTsconfig(input.text), {
    onNone: (): ReadonlyArray<Entry> => [],
    onSome: (record) => {
      const dir = dirOf(input.path)
      return Option.match(roleOf(input, record, dir, MAX_DEPTH), {
        onNone: (): ReadonlyArray<Entry> => [],
        onSome: (role) => {
          const block = effectiveBlock(input, record, dir, MAX_DEPTH)
          return [
            ...diagnosticEntries(input.file, role, mergedSeverities(input.tsgoDefaults, block)),
            ...overrideEntries(input.file, role, block),
          ]
        },
      })
    },
  })
