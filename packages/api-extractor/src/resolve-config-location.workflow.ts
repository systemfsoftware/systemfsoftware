import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

/** The configuration search: where the walk started, and the path it found, if any. */
export class ConfigSearch extends Schema.TaggedClass<ConfigSearch>()('ConfigSearch', {
  startFolder: Schema.String,
  foundPath: Schema.optional(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigLocationDecision')
type DecisionTypeId = typeof DecisionTypeId

/** A configuration file the search found, at the path the walk resolved. */
export class ConfigLocated extends Schema.TaggedClass<ConfigLocated>()('ConfigLocated', {
  filePath: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

/** No ancestor of the start folder held either candidate name. */
export class ConfigNotLocated extends Schema.TaggedClass<ConfigNotLocated>()('ConfigNotLocated', {}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const ConfigLocationDecision = Schema.Union([ConfigLocated, ConfigNotLocated])
export type ConfigLocationDecision = typeof ConfigLocationDecision.Type

export const resolveConfigLocation = Workflow.make({
  command: ConfigSearch,
  decision: ConfigLocationDecision,
  error: Schema.Never,
  decide: (search: ConfigSearch): Result.Result<ConfigLocationDecision, never> =>
    Option.match(Option.fromNullishOr(search.foundPath), {
      onNone: () => Result.succeed(new ConfigNotLocated({})),
      onSome: (filePath) => Result.succeed(new ConfigLocated({ filePath })),
    }),
})
