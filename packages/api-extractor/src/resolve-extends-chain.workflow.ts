import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const ChainTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigChainDecision')
type ChainTypeId = typeof ChainTypeId

const JsonRecord = Schema.Record(Schema.String, Schema.Json)

const JsonRecordFromString = Schema.fromJsonString(JsonRecord)

type ChainRecord = typeof JsonRecord.Type

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

const specifierOf = (record: ChainRecord): Option.Option<string> =>
  Option.filter(
    Option.filter(Option.some(record['extends']), Schema.is(Schema.String)),
    (specifier) => specifier.length > 0,
  )

const decisionOf = (command: ConfigChainStep, record: ChainRecord): ConfigChainDecision =>
  Option.match(specifierOf(record), {
    onNone: () => new ChainComplete({ record: strippedOf(record) }),
    onSome: (specifier) => new FollowExtends({ specifier, fromFolder: command.fromFolder, record: strippedOf(record) }),
  })

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
