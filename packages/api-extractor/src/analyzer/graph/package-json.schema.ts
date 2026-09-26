import { Match, Schema, SchemaTransformation } from 'effect'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import type { Json } from 'effect/Schema'

/**
 * npm's `package.json`. The manifest a package ships is npm's to shape: its fields are optional,
 * npm validates nothing, and upstream's lookup reads a field only when it already has the shape it
 * wants. So every field stays arbitrary JSON on the encoded side, and the decoded side is the forms
 * the analyzer's metadata resolver distinguishes — a field whose shape is unwelcome decodes to
 * "nothing to read here", never to a decode failure.
 */

/** A field's text form: `"main": "./index.js"`, `"types": "./index.d.ts"`. */
export interface ManifestText {
  readonly kind: 'ManifestText'
  readonly text: string
}

/** A field's fallback-list form: `"exports": ["./a.js", "./b.js"]`. */
export interface ManifestSequence {
  readonly kind: 'ManifestSequence'
  readonly entries: ReadonlyArray<ManifestValue>
}

/** A field's map form: `"exports": { ".": "./index.js" }`, `"typesVersions": { ">=4": {...} }`. */
export interface ManifestMap {
  readonly kind: 'ManifestMap'
  readonly entries: Readonly<Record<string, ManifestValue>>
}

/** The JSON values a field can carry that the resolver reads nothing from. */
export type ManifestOpaqueValue = number | boolean | null

export const ManifestOpaqueValue = Schema.Union([Schema.Null, Schema.Boolean, Schema.Finite])

/** A field form the resolver reads nothing from: a number, a boolean, or `null`. */
export interface ManifestOpaque {
  readonly kind: 'ManifestOpaque'
  readonly value: ManifestOpaqueValue
}

/** The forms the metadata resolver distinguishes in a manifest field's JSON value. */
export type ManifestValue = ManifestText | ManifestSequence | ManifestMap | ManifestOpaque

export const ManifestText = Schema.Struct({
  kind: Schema.Literal('ManifestText'),
  text: Schema.String,
})

export const ManifestSequence: Schema.Codec<ManifestSequence> = Schema.Struct({
  kind: Schema.Literal('ManifestSequence'),
  entries: Schema.Array(Schema.suspend((): Schema.Codec<ManifestValue> => ManifestValue)),
})

export const ManifestMap: Schema.Codec<ManifestMap> = Schema.Struct({
  kind: Schema.Literal('ManifestMap'),
  entries: Schema.Record(Schema.String, Schema.suspend((): Schema.Codec<ManifestValue> => ManifestValue)),
})

export const ManifestOpaque = Schema.Struct({
  kind: Schema.Literal('ManifestOpaque'),
  value: ManifestOpaqueValue,
})

export const ManifestValue: Schema.Codec<ManifestValue> = Schema.suspend(
  (): Schema.Codec<ManifestValue> => Schema.Union([ManifestText, ManifestSequence, ManifestMap, ManifestOpaque]),
).annotate({
  identifier: 'ManifestValue',
  recursionBudget: { maxDepth: 4, depthSize: 'small' },
})

/**
 * A number a `package.json` document can parse to, `1e999`'s `Infinity` included: `Schema.Json`
 * refuses non-finite numbers and the repo lint forbids `Schema.Number`, so this declaration is the
 * only spelling that admits every number JSON text can produce.
 */
const JsonNumber = Schema.declare((value: unknown): value is number => typeof value === 'number')

/**
 * A manifest field value as a document can parse it: any JSON value, with the infinities `1e999`
 * parses to allowed at any depth. `Schema.Json` refuses non-finite numbers, so the structure is
 * spelled out over {@link JsonNumber}; its Type stays `Json`, which is what npm's fields are.
 */
const DeclaredValue: Schema.Codec<Json> = Schema.suspend(
  (): Schema.Codec<Json> =>
    Schema.Union([
      Schema.Null,
      Schema.Boolean,
      JsonNumber,
      Schema.String,
      Schema.Array(DeclaredValue),
      Schema.Record(Schema.String, DeclaredValue),
    ]),
).annotate({
  identifier: 'DeclaredValue',
  recursionBudget: { maxDepth: 4, depthSize: 'small' },
})

/** The manifest fields this analyzer reads. Absent when npm omits them, or when npm sends another shape. */
export const PackageJson = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  main: Schema.optionalKey(Schema.String),
  types: Schema.optionalKey(Schema.String),
  typings: Schema.optionalKey(Schema.String),
  tsdocMetadata: Schema.optionalKey(Schema.String),
  exports: Schema.optionalKey(ManifestValue),
  typesVersions: Schema.optionalKey(ManifestValue),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  optionalDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})
export type PackageJson = typeof PackageJson.Type

/** The same fields as npm writes them: any JSON, because npm does not validate a manifest. */
interface NodePackageJsonWire {
  readonly name?: Json
  readonly version?: Json
  readonly main?: Json
  readonly types?: Json
  readonly typings?: Json
  readonly tsdocMetadata?: Json
  readonly exports?: Json
  readonly typesVersions?: Json
  readonly dependencies?: Json
  readonly devDependencies?: Json
  readonly peerDependencies?: Json
  readonly optionalDependencies?: Json
}

/** A field's text, when the field carries text. */
const textOf = (value: Json): Option.Option<string> =>
  Match.value(value).pipe(
    Match.when(Schema.is(Schema.String), (text): Option.Option<string> => Option.some(text)),
    Match.orElse(() => Option.none()),
  )

/** A dependency table, when every entry names a string range. */
const stringRecordOf = (value: Json): Option.Option<Readonly<Record<string, string>>> =>
  Match.value(value).pipe(
    Match.when(
      Schema.is(Schema.Record(Schema.String, Schema.String)),
      (record): Option.Option<Readonly<Record<string, string>>> => Option.some(record),
    ),
    Match.orElse(() => Option.none()),
  )

/**
 * The scalar an unmodelled field form stands for. Only strings, arrays and objects are modelled, so
 * this sees a number, a boolean or `null`; anything else has no JSON scalar to keep and is `null`.
 */
const opaqueValueOf = (value: Json): ManifestOpaqueValue =>
  Match.value(value).pipe(
    Match.when(Schema.is(Schema.Null), (nullish) => nullish),
    Match.when(Schema.is(Schema.Boolean), (flag) => flag),
    Match.when(Schema.is(Schema.Finite), (number) => number),
    Match.orElse(() => null),
  )

const DeclaredArray = Schema.Array(DeclaredValue)
const DeclaredRecord = Schema.Record(Schema.String, DeclaredValue)

const manifestValueOf = (wire: Json): ManifestValue =>
  Match.value(wire).pipe(
    Match.when(
      Schema.is(Schema.String),
      (text): ManifestText => ManifestText.make({ kind: 'ManifestText', text }),
    ),
    Match.when(
      Schema.is(DeclaredArray),
      (entries): ManifestSequence =>
        ManifestSequence.make({ kind: 'ManifestSequence', entries: Arr.map(entries, manifestValueOf) }),
    ),
    Match.when(
      Schema.is(DeclaredRecord),
      (entries): ManifestMap =>
        ManifestMap.make({ kind: 'ManifestMap', entries: Record.map(entries, manifestValueOf) }),
    ),
    Match.orElse((value): ManifestOpaque =>
      ManifestOpaque.make({ kind: 'ManifestOpaque', value: opaqueValueOf(value) })
    ),
  )

const manifestWireOf = (value: ManifestValue): Json =>
  Match.value(value).pipe(
    Match.discriminator('kind')('ManifestText', (text) => text.text),
    Match.discriminator('kind')('ManifestSequence', (sequence) => Arr.map(sequence.entries, manifestWireOf)),
    Match.discriminator('kind')('ManifestMap', (map) => Record.map(map.entries, manifestWireOf)),
    Match.discriminator('kind')('ManifestOpaque', (opaque) => opaque.value),
    Match.exhaustive,
  )

const nameEntryOf = (value: Json | undefined): { readonly name?: string } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), textOf), {
    onNone: () => ({}),
    onSome: (present) => ({ name: present }),
  })

const versionEntryOf = (value: Json | undefined): { readonly version?: string } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), textOf), {
    onNone: () => ({}),
    onSome: (present) => ({ version: present }),
  })

const mainEntryOf = (value: Json | undefined): { readonly main?: string } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), textOf), {
    onNone: () => ({}),
    onSome: (present) => ({ main: present }),
  })

const typesEntryOf = (value: Json | undefined): { readonly types?: string } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), textOf), {
    onNone: () => ({}),
    onSome: (present) => ({ types: present }),
  })

const typingsEntryOf = (value: Json | undefined): { readonly typings?: string } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), textOf), {
    onNone: () => ({}),
    onSome: (present) => ({ typings: present }),
  })

const tsdocMetadataEntryOf = (value: Json | undefined): { readonly tsdocMetadata?: string } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), textOf), {
    onNone: () => ({}),
    onSome: (present) => ({ tsdocMetadata: present }),
  })

const dependenciesEntryOf = (value: Json | undefined): { readonly dependencies?: Readonly<Record<string, string>> } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), stringRecordOf), {
    onNone: () => ({}),
    onSome: (present) => ({ dependencies: present }),
  })

const devDependenciesEntryOf = (
  value: Json | undefined,
): { readonly devDependencies?: Readonly<Record<string, string>> } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), stringRecordOf), {
    onNone: () => ({}),
    onSome: (present) => ({ devDependencies: present }),
  })

const peerDependenciesEntryOf = (
  value: Json | undefined,
): { readonly peerDependencies?: Readonly<Record<string, string>> } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), stringRecordOf), {
    onNone: () => ({}),
    onSome: (present) => ({ peerDependencies: present }),
  })

const optionalDependenciesEntryOf = (
  value: Json | undefined,
): { readonly optionalDependencies?: Readonly<Record<string, string>> } =>
  Option.match(Option.flatMap(Option.fromUndefinedOr(value), stringRecordOf), {
    onNone: () => ({}),
    onSome: (present) => ({ optionalDependencies: present }),
  })

const exportsValueEntryOf = (value: Json | undefined): { readonly exports?: ManifestValue } =>
  Option.match(Option.fromUndefinedOr(value), {
    onNone: () => ({}),
    onSome: (present) => ({ exports: manifestValueOf(present) }),
  })

const typesVersionsValueEntryOf = (value: Json | undefined): { readonly typesVersions?: ManifestValue } =>
  Option.match(Option.fromUndefinedOr(value), {
    onNone: () => ({}),
    onSome: (present) => ({ typesVersions: manifestValueOf(present) }),
  })

const exportsWireEntryOf = (value: ManifestValue | undefined): { readonly exports?: Json } =>
  Option.match(Option.fromNullishOr(value), {
    onNone: () => ({}),
    onSome: (present) => ({ exports: manifestWireOf(present) }),
  })

const typesVersionsWireEntryOf = (value: ManifestValue | undefined): { readonly typesVersions?: Json } =>
  Option.match(Option.fromNullishOr(value), {
    onNone: () => ({}),
    onSome: (present) => ({ typesVersions: manifestWireOf(present) }),
  })

const packageJsonOf = (wire: NodePackageJsonWire): PackageJson => ({
  ...nameEntryOf(wire.name),
  ...versionEntryOf(wire.version),
  ...mainEntryOf(wire.main),
  ...typesEntryOf(wire.types),
  ...typingsEntryOf(wire.typings),
  ...tsdocMetadataEntryOf(wire.tsdocMetadata),
  ...exportsValueEntryOf(wire.exports),
  ...typesVersionsValueEntryOf(wire.typesVersions),
  ...dependenciesEntryOf(wire.dependencies),
  ...devDependenciesEntryOf(wire.devDependencies),
  ...peerDependenciesEntryOf(wire.peerDependencies),
  ...optionalDependenciesEntryOf(wire.optionalDependencies),
})

const nodePackageJsonOf = (packageJson: PackageJson): NodePackageJsonWire => ({
  ...nameEntryOf(packageJson.name),
  ...versionEntryOf(packageJson.version),
  ...mainEntryOf(packageJson.main),
  ...typesEntryOf(packageJson.types),
  ...typingsEntryOf(packageJson.typings),
  ...tsdocMetadataEntryOf(packageJson.tsdocMetadata),
  ...exportsWireEntryOf(packageJson.exports),
  ...typesVersionsWireEntryOf(packageJson.typesVersions),
  ...dependenciesEntryOf(packageJson.dependencies),
  ...devDependenciesEntryOf(packageJson.devDependencies),
  ...peerDependenciesEntryOf(packageJson.peerDependencies),
  ...optionalDependenciesEntryOf(packageJson.optionalDependencies),
})

export const NodePackageJson = Schema.Struct({
  name: Schema.optionalKey(DeclaredValue),
  version: Schema.optionalKey(DeclaredValue),
  main: Schema.optionalKey(DeclaredValue),
  types: Schema.optionalKey(DeclaredValue),
  typings: Schema.optionalKey(DeclaredValue),
  tsdocMetadata: Schema.optionalKey(DeclaredValue),
  exports: Schema.optionalKey(DeclaredValue),
  typesVersions: Schema.optionalKey(DeclaredValue),
  dependencies: Schema.optionalKey(DeclaredValue),
  devDependencies: Schema.optionalKey(DeclaredValue),
  peerDependencies: Schema.optionalKey(DeclaredValue),
  optionalDependencies: Schema.optionalKey(DeclaredValue),
}).pipe(
  Schema.decodeTo(
    PackageJson,
    SchemaTransformation.transform({ decode: packageJsonOf, encode: nodePackageJsonOf }),
  ),
)
export type NodePackageJson = typeof NodePackageJson.Type

/** A `package.json` object or document, decoded into the manifest fields the analyzer reads. */
export const NodePackageJsonFromString = Schema.fromJsonString(NodePackageJson)

interface ManifestReading {
  readonly name: string | undefined
  readonly types: string | undefined
  readonly dependencyNames: ReadonlyArray<string>
  readonly exportsKind: string | undefined
}

/** The fields this decode is expected to read, written from the resolution contract alone. */
const upstreamReadingOf = (document: Readonly<Record<string, Json>>): ManifestReading => ({
  name: textFieldOf(document, 'name'),
  types: textFieldOf(document, 'types'),
  dependencyNames: dependencyNamesOfField(document['dependencies']),
  exportsKind: kindOfField(document, 'exports'),
})

const textFieldOf = (document: Readonly<Record<string, Json>>, key: string): string | undefined =>
  typeof document[key] === 'string' ? document[key] : undefined

const kindOfField = (document: Readonly<Record<string, Json>>, key: string): string | undefined =>
  Option.getOrUndefined(Option.map(Option.fromUndefinedOr(document[key]), unmodelledKindOf))

const isJsonArray = (value: Json): value is ReadonlyArray<Json> => Array.isArray(value)

const unmodelledKindOf = (value: Json): string =>
  Match.value(value).pipe(
    Match.when(Schema.is(Schema.String), () => 'ManifestText'),
    Match.when(isJsonArray, () => 'ManifestSequence'),
    Match.when(isPlainRecord, () => 'ManifestMap'),
    Match.orElse(() => 'ManifestOpaque'),
  )

const isPlainRecord = (value: Json | undefined): value is Readonly<Record<string, Json>> =>
  [typeof value === 'object', value !== null, !Array.isArray(value)].every((clause) => clause)

const everyEntryIsString = (record: Readonly<Record<string, Json>>): boolean =>
  Object.values(record).every((entry) => typeof entry === 'string')

const dependencyNamesOfField = (value: Json | undefined): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.filter(Option.fromNullishOr(value), isPlainRecord).pipe(
      Option.filter(everyEntryIsString),
      Option.map((record) => Object.keys(record)),
    ),
    () => [],
  )

const manifestReadingOf = (document: Readonly<Record<string, Json>>): Option.Option<ManifestReading> =>
  Option.map(Schema.decodeOption(NodePackageJson)(document), (manifest) => ({
    name: manifest.name,
    types: manifest.types,
    dependencyNames: Arr.map(Record.toEntries(manifest.dependencies ?? {}), ([name]) => name),
    exportsKind: Option.getOrUndefined(Option.map(Option.fromNullishOr(manifest.exports), (value) => value.kind)),
  }))

const readingsAgree = (reading: ManifestReading, upstream: ManifestReading): boolean =>
  [
    reading.name === upstream.name,
    reading.types === upstream.types,
    reading.exportsKind === upstream.exportsKind,
    Arr.every(reading.dependencyNames, (name) => upstream.dependencyNames.includes(name)),
    Arr.every(upstream.dependencyNames, (name) => reading.dependencyNames.includes(name)),
  ].every((clause) => clause)

const MANIFEST_DOCUMENT_SEEDS: ReadonlyArray<Readonly<Record<string, Json>>> = [
  {},
  { name: 5 },
  { name: 'pkg', version: 2 },
  { name: Number.POSITIVE_INFINITY },
  { version: Number.NEGATIVE_INFINITY },
  { types: 5 },
  { types: Number.POSITIVE_INFINITY },
  { main: false },
  { tsdocMetadata: null },
  { dependencies: { a: 5 } },
  { dependencies: [] },
  { dependencies: Number.POSITIVE_INFINITY },
  { dependencies: { a: '^1.0.0', b: '~2.0.0' } },
  { exports: 3 },
  { exports: Number.POSITIVE_INFINITY },
  { exports: null },
  { exports: [1, 'a'] },
  { exports: [Number.POSITIVE_INFINITY, 'a'] },
  { exports: { '.': [1] } },
  { typesVersions: 'x' },
  { typesVersions: { '*': { '*': [Number.POSITIVE_INFINITY] } } },
  { exports: 'dist/index.js', types: 'dist/index.d.ts', dependencies: { a: '1' } },
]

const OPAQUE_VALUE_SEEDS: ReadonlyArray<number> = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  0,
  2,
]

const opaqueNumberDecodes = (value: number): boolean => Option.isSome(Schema.decodeOption(ManifestOpaqueValue)(value))

const finiteNumberHolds = (value: number): boolean => Number.isFinite(value)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema: S } = await import('effect')

  const ManifestDocument = S.Struct({
    name: S.optionalKey(S.Json),
    version: S.optionalKey(S.Json),
    main: S.optionalKey(S.Json),
    types: S.optionalKey(S.Json),
    typings: S.optionalKey(S.Json),
    tsdocMetadata: S.optionalKey(S.Json),
    exports: S.optionalKey(S.Json),
    typesVersions: S.optionalKey(S.Json),
    dependencies: S.optionalKey(S.Json),
    devDependencies: S.optionalKey(S.Json),
    peerDependencies: S.optionalKey(S.Json),
    optionalDependencies: S.optionalKey(S.Json),
  })

  it.prop(
    '∀d_ManifestDocument_≡Accepted',
    { of: [ManifestDocument], subject: manifestReadingOf },
    (subject, [document]) =>
      Arr.every(
        Arr.append(MANIFEST_DOCUMENT_SEEDS, document),
        (candidate) =>
          Option.match(subject(candidate), {
            onNone: () => false,
            onSome: (reading) => readingsAgree(reading, upstreamReadingOf(candidate)),
          }),
      ),
  )

  it.prop(
    '∀n_ManifestOpaqueNumberRefusal_≡Finite',
    { of: [S.Finite], subject: opaqueNumberDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(OPAQUE_VALUE_SEEDS, value),
        (candidate) => subject(candidate) === finiteNumberHolds(candidate),
      ),
  )
}
