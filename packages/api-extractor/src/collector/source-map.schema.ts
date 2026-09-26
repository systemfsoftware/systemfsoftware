import { Match, Schema, SchemaTransformation } from 'effect'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

/**
 * A source map as a compiler writes it (`*.d.ts.map`): the raw JSON the source map format
 * declares, whose `sources` and `names` a writer may omit. It stays the encoded side; the decoded
 * side is the shape `SourceMapConsumer` reads, with the defaults `SourceMapper` used to apply.
 *
 * The version stays whatever JSON the document carries and decodes to `String(version)`, exactly
 * the text upstream reads: a fractional or string version is a document upstream accepts, and
 * refusing it would refuse input this domain can represent.
 */

/** The decoded source map: the fields `SourceMapConsumer` reads, defaults already applied. */
export const SourceMap = Schema.Struct({
  version: Schema.String,
  sources: Schema.mutable(Schema.Array(Schema.String)),
  names: Schema.mutable(Schema.Array(Schema.String)),
  mappings: Schema.String,
  file: Schema.optionalKey(Schema.String),
  sourceRoot: Schema.optionalKey(Schema.String),
})
export type SourceMap = typeof SourceMap.Type

/** The raw source map JSON, the encoded side of {@link SourceMap}. */
interface RawSourceMapJson {
  readonly version: number | string
  readonly file?: string
  readonly sourceRoot?: string
  readonly sources?: ReadonlyArray<string>
  readonly names?: ReadonlyArray<string>
  readonly mappings: string
}

const stringsOf = (values: ReadonlyArray<string> | undefined): string[] =>
  Option.getOrElse(Option.map(Option.fromNullishOr(values), (present) => [...present]), () => [])

/**
 * A number a source map document can parse to, `1e999`'s `Infinity` included: `Schema.Json` refuses
 * non-finite numbers and the repo lint forbids `Schema.Number`, so this declaration is the only
 * spelling that admits every number JSON text can produce.
 */
const JsonNumber = Schema.declare((value: unknown): value is number => typeof value === 'number')

const fileEntryOf = (file: string | undefined): { readonly file?: string } =>
  Option.match(Option.fromNullishOr(file), {
    onNone: () => ({}),
    onSome: (present) => ({ file: present }),
  })

const sourceRootEntryOf = (sourceRoot: string | undefined): { readonly sourceRoot?: string } =>
  Option.match(Option.fromNullishOr(sourceRoot), {
    onNone: () => ({}),
    onSome: (present) => ({ sourceRoot: present }),
  })

const sourceMapOf = (raw: RawSourceMapJson): SourceMap => ({
  version: String(raw.version),
  sources: stringsOf(raw.sources),
  names: stringsOf(raw.names),
  mappings: raw.mappings,
  ...fileEntryOf(raw.file),
  ...sourceRootEntryOf(raw.sourceRoot),
})

/** Whether a version text is the canonical decimal of a finite number, so encoding it as one is lossless. */
const isCanonicalNumberText = (version: string): boolean =>
  [Number.isFinite(Number(version)), String(Number(version)) === version].every((clause) => clause)

/** The version as JSON: the number when the text is its canonical decimal, else the text itself. */
const wireVersionOf = (version: string): number | string =>
  Match.value(isCanonicalNumberText(version)).pipe(
    Match.when(true, () => Number(version)),
    Match.when(false, () => version),
    Match.exhaustive,
  )

const rawSourceMapJsonOf = (map: SourceMap): RawSourceMapJson => ({
  version: wireVersionOf(map.version),
  sources: [...map.sources],
  names: [...map.names],
  mappings: map.mappings,
  ...fileEntryOf(map.file),
  ...sourceRootEntryOf(map.sourceRoot),
})

export const SourceMapJson = Schema.Struct({
  version: Schema.Union([Schema.String, JsonNumber]),
  file: Schema.optionalKey(Schema.String),
  sourceRoot: Schema.optionalKey(Schema.String),
  sources: Schema.optionalKey(Schema.Array(Schema.String)),
  names: Schema.optionalKey(Schema.Array(Schema.String)),
  mappings: Schema.String,
}).pipe(
  Schema.decodeTo(
    SourceMap,
    SchemaTransformation.transform({ decode: sourceMapOf, encode: rawSourceMapJsonOf }),
  ),
)
export type SourceMapJson = typeof SourceMapJson.Type

export const SourceMapJsonFromString = Schema.fromJsonString(SourceMapJson)

const VERSION_SEEDS: ReadonlyArray<number | string> = [
  3,
  3.5,
  0,
  -1,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  '3',
  '3.5',
  '',
  'abc',
  'Infinity',
  'NaN',
]

const versionTextFor = (value: number | string): Option.Option<string> =>
  Option.map(Schema.decodeOption(SourceMapJson)({ version: value, mappings: '' }), (map) => map.version)

const upstreamVersionTextOf = (value: number | string): string => String(value)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀v_SourceMapVersion_≡Stringified',
    { of: [Schema.Union([Schema.Finite, Schema.String])], subject: versionTextFor },
    (subject, [value]) =>
      Arr.every(
        Arr.append(VERSION_SEEDS, value),
        (candidate) => Option.getOrUndefined(subject(candidate)) === upstreamVersionTextOf(candidate),
      ),
  )
}
