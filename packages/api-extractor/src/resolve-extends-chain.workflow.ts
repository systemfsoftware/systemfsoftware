/// <reference types="vitest/importMeta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { SchemaTransformation } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const ChainTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigChainDecision')
type ChainTypeId = typeof ChainTypeId

const JsonRecord = Schema.Record(Schema.String, Schema.Json)

const JsonRecordFromString = Schema.fromJsonString(JsonRecord)

type ChainRecord = typeof JsonRecord.Type

/** A non-text `extends` value that is neither null nor text: a boolean, number, array, or record. */
const NonTextNonNullJson = Schema.Union([
  Schema.Boolean,
  Schema.Finite,
  Schema.Array(Schema.Json),
  Schema.Record(Schema.String, Schema.Json),
])

/** The wire an `extends` specifier arrives in: upstream accepts only a written path. */
const ExtendsSpecifierWire = Schema.NonEmptyString

/** An `extends` specifier: a non-empty module or file path to follow. */
const ExtendsSpecifier = Schema.TaggedStruct('ExtendsSpecifier', { specifier: ExtendsSpecifierWire })
type ExtendsSpecifier = typeof ExtendsSpecifier.Type

/** No `extends` at all: the field was absent, empty, or `null`. */
const ExtendsAbsent = Schema.TaggedStruct('ExtendsAbsent', {})
type ExtendsAbsent = typeof ExtendsAbsent.Type

/** An `extends` value that is neither text nor absent: kept verbatim, never followed. */
const ExtendsNonText = Schema.TaggedStruct('ExtendsNonText', { value: NonTextNonNullJson })
type ExtendsNonText = typeof ExtendsNonText.Type

/**
 * The `extends` field of one configuration file: a specifier to follow, nothing to follow, or a
 * non-text value that is not a specifier at all — each state carries only what it means.
 */
const ExtendsSetting = Schema.Union([
  ExtendsSpecifierWire.pipe(
    Schema.decodeTo(
      ExtendsSpecifier,
      SchemaTransformation.transform({
        decode: (specifier: typeof ExtendsSpecifierWire.Type): ExtendsSpecifier => ExtendsSpecifier.make({ specifier }),
        encode: (setting: ExtendsSpecifier): typeof ExtendsSpecifierWire.Type => setting.specifier,
      }),
    ),
  ),
  Schema.Union([Schema.Literal(''), Schema.Null]).pipe(
    Schema.decodeTo(
      ExtendsAbsent,
      SchemaTransformation.transform({
        decode: (_empty: '' | null): ExtendsAbsent => ExtendsAbsent.make({}),
        encode: (_absent: ExtendsAbsent): '' | null => '',
      }),
    ),
  ),
  NonTextNonNullJson.pipe(
    Schema.decodeTo(
      ExtendsNonText,
      SchemaTransformation.transform({
        decode: (value: typeof NonTextNonNullJson.Type): ExtendsNonText => ExtendsNonText.make({ value }),
        encode: (setting: ExtendsNonText): typeof NonTextNonNullJson.Type => setting.value,
      }),
    ),
  ),
])
type ExtendsSetting = typeof ExtendsSetting.Type

/** The `extends` field of one configuration file, decoded alongside its record. */
const ConfigChainLayer = Schema.Struct({
  extends: Schema.optional(ExtendsSetting),
})

export class FollowExtends extends Schema.TaggedClass<FollowExtends>()('FollowExtends', {
  specifier: Schema.String,
  fromFolder: Schema.String,
  record: JsonRecord,
}) {
  readonly [ChainTypeId] = ChainTypeId
}

export class ChainComplete extends Schema.TaggedClass<ChainComplete>()('ChainComplete', {
  record: JsonRecord,
}) {
  readonly [ChainTypeId] = ChainTypeId
}

export class CircularExtends extends Schema.TaggedClass<CircularExtends>()('CircularExtends', {
  chain: Schema.Array(Schema.String),
}) {
  readonly [ChainTypeId] = ChainTypeId
}

export class ChainMissing extends Schema.TaggedClass<ChainMissing>()('ChainMissing', {
  fromFolder: Schema.String,
  filePath: Schema.String,
}) {
  readonly [ChainTypeId] = ChainTypeId
}

export class ChainMalformed extends Schema.TaggedClass<ChainMalformed>()('ChainMalformed', {
  filePath: Schema.String,
  cause: Schema.String,
}) {
  readonly [ChainTypeId] = ChainTypeId
}

export const ConfigChainDecision = Schema.Union([
  FollowExtends,
  ChainComplete,
  CircularExtends,
  ChainMissing,
  ChainMalformed,
])
export type ConfigChainDecision = typeof ConfigChainDecision.Type

export class ConfigChainStep extends Schema.TaggedClass<ConfigChainStep>()('ConfigChainStep', {
  filePath: Schema.String,
  fromFolder: Schema.String,
  visited: Schema.Array(Schema.String),
  content: Schema.optional(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const strippedOf = (record: ChainRecord): ChainRecord => {
  const { extends: _specifier, ...stripped } = record
  return stripped
}

const settingOf = (record: ChainRecord): Option.Option<ExtendsSetting> =>
  Option.flatMap(
    Schema.decodeOption(ConfigChainLayer)(record),
    (layer) => Option.fromNullishOr(layer.extends),
  )

const decisionOf = (command: ConfigChainStep, record: ChainRecord): ConfigChainDecision => {
  const stripped = strippedOf(record)
  return Option.match(settingOf(record), {
    onNone: () => new ChainComplete({ record: stripped }),
    onSome: (setting) =>
      Match.value(setting).pipe(
        Match.tag('ExtendsSpecifier', (specifier) =>
          new FollowExtends({ specifier: specifier.specifier, fromFolder: command.fromFolder, record: stripped })),
        Match.tag('ExtendsAbsent', () =>
          new ChainComplete({ record: stripped })),
        Match.tag('ExtendsNonText', () =>
          new ChainComplete({ record: stripped })),
        Match.exhaustive,
      ),
  })
}

const stepOf = (command: ConfigChainStep): Result.Result<ConfigChainDecision, never> =>
  Match.value(command.visited.includes(command.filePath)).pipe(
    Match.when(
      true,
      () => Result.succeed(new CircularExtends({ chain: [...command.visited, command.filePath] })),
    ),
    Match.when(false, () =>
      Option.match(Option.fromNullishOr(command.content), {
        onNone: () => Result.succeed(new ChainMissing({ fromFolder: command.fromFolder, filePath: command.filePath })),
        onSome: (content) =>
          Result.match(Schema.decodeResult(JsonRecordFromString)(content), {
            onFailure: (error) =>
              Result.succeed(new ChainMalformed({ filePath: command.filePath, cause: error.message })),
            onSuccess: (record) => Result.succeed(decisionOf(command, record)),
          }),
      })),
    Match.exhaustive,
  )

export const resolveExtendsChain = Workflow.make({
  command: ConfigChainStep,
  decision: ConfigChainDecision,
  error: Schema.Never,
  decide: (command: ConfigChainStep): Result.Result<ConfigChainDecision, never> => stepOf(command),
})

const specifierSeeds: ReadonlyArray<string> = ['', ' ', '\n', '<', 'a', './base.json']

const specifierDecodes = (text: string): boolean => Result.isSuccess(Schema.decodeResult(ExtendsSpecifierWire)(text))

const isNonEmpty = (text: string): boolean => text.length > 0

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_ExtendsSpecifierRefusal_≡NonEmpty',
    { of: [Schema.String], subject: specifierDecodes },
    (subject, [value]) => Arr.every(Arr.append(specifierSeeds, value), (text) => subject(text) === isNonEmpty(text)),
  )
}
