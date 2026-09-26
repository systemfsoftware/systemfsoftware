import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const NarrationTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/ConfigNarrationDecision')
type NarrationTypeId = typeof NarrationTypeId

export class ConfigSourceNarrated extends Schema.TaggedClass<ConfigSourceNarrated>()('ConfigSourceNarrated', {}) {
  readonly [NarrationTypeId] = NarrationTypeId
}

export class ConfigSourceNotNarrated
  extends Schema.TaggedClass<ConfigSourceNotNarrated>()('ConfigSourceNotNarrated', {})
{
  readonly [NarrationTypeId] = NarrationTypeId
}

export const ConfigNarrationDecision = Schema.Union([ConfigSourceNarrated, ConfigSourceNotNarrated])
export type ConfigNarrationDecision = typeof ConfigNarrationDecision.Type

export class ConfigNarration extends Schema.TaggedClass<ConfigNarration>()('ConfigNarration', {
  autoLocated: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const narrateConfigSource = Workflow.make({
  command: ConfigNarration,
  decision: ConfigNarrationDecision,
  error: Schema.Never,
  decide: (command: ConfigNarration): Result.Result<ConfigNarrationDecision, never> =>
    Match.value(command.autoLocated).pipe(
      Match.when(true, () => Result.succeed(new ConfigSourceNarrated({}))),
      Match.when(false, () => Result.succeed(new ConfigSourceNotNarrated({}))),
      Match.exhaustive,
    ),
})
