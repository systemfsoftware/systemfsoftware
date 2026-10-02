import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const SourceTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigSourceDecision')
type SourceTypeId = typeof SourceTypeId

export class ExplicitConfigSource extends Schema.TaggedClass<ExplicitConfigSource>()('ExplicitConfigSource', {
  path: Schema.String,
}) {
  readonly [SourceTypeId] = SourceTypeId
}

export class SearchedConfigSource extends Schema.TaggedClass<SearchedConfigSource>()('SearchedConfigSource', {}) {
  readonly [SourceTypeId] = SourceTypeId
}

export const ConfigSourceDecision = Schema.Union([ExplicitConfigSource, SearchedConfigSource])
export type ConfigSourceDecision = typeof ConfigSourceDecision.Type

export class ConfigSource extends Schema.TaggedClass<ConfigSource>()('ConfigSource', {
  startFolder: Schema.String,
  explicitPath: Schema.optional(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const chooseConfigSource = Workflow.make({
  command: ConfigSource,
  decision: ConfigSourceDecision,
  error: Schema.Never,
  decide: (command: ConfigSource): Result.Result<ConfigSourceDecision, never> =>
    Result.succeed(
      Option.match(Option.fromNullishOr(command.explicitPath), {
        onNone: () => SearchedConfigSource.make(),
        onSome: (path) => ExplicitConfigSource.make({ path }),
      }),
    ),
})
