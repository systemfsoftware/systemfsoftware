import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

export type MutableJsonRecord = Record<string, Schema.Json>

const isConfigRecord = (u: Schema.Json): u is MutableJsonRecord =>
  Match.value({ object: typeof u === 'object', nonNull: u !== null, list: Array.isArray(u) }).pipe(
    Match.when({ object: true, nonNull: true, list: false }, () => true),
    Match.orElse(() => false),
  )

const asConfigRecord = (value: Schema.Json | undefined): Option.Option<MutableJsonRecord> =>
  Option.fromNullishOr(value).pipe(Option.filter(isConfigRecord))

const MergeConfigTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/MergeConfigDecision')
type MergeConfigTypeId = typeof MergeConfigTypeId

export class ConfigMerged extends Schema.TaggedClass<ConfigMerged>()('ConfigMerged', {
  merged: Schema.Record(Schema.String, Schema.Json),
}) {
  readonly [MergeConfigTypeId] = MergeConfigTypeId
}

export class ConfigReplaced extends Schema.TaggedClass<ConfigReplaced>()('ConfigReplaced', {
  derived: Schema.Record(Schema.String, Schema.Json),
}) {
  readonly [MergeConfigTypeId] = MergeConfigTypeId
}

export const MergeConfigDecision = Schema.Union([ConfigMerged, ConfigReplaced])
export type MergeConfigDecision = typeof MergeConfigDecision.Type

export class MergeConfig extends Schema.TaggedClass<MergeConfig>()('MergeConfig', {
  base: Schema.Record(Schema.String, Schema.Json),
  derived: Schema.Record(Schema.String, Schema.Json),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const RecurseTag = { _tag: 'Recurse' } as const
type RecurseTag = typeof RecurseTag
interface ConfigMergeRecurse extends RecurseTag {
  readonly base: MutableJsonRecord
  readonly derived: MutableJsonRecord
}

const ReplaceTag = { _tag: 'Replace' } as const
type ReplaceTag = typeof ReplaceTag
interface ConfigMergeReplace extends ReplaceTag {
  readonly derived: Schema.Json
}

type ConfigMergeShape = ConfigMergeRecurse | ConfigMergeReplace

const replaceOf = (derived: Schema.Json): ConfigMergeShape => ({ _tag: 'Replace', derived })
const recurseOf = (base: MutableJsonRecord, derived: MutableJsonRecord): ConfigMergeShape => ({
  _tag: 'Recurse',
  base,
  derived,
})

const mergeShape = (base: Schema.Json | undefined, derived: Schema.Json): ConfigMergeShape =>
  Option.match(Option.all([asConfigRecord(base), asConfigRecord(derived)]), {
    onNone: () => replaceOf(derived),
    onSome: ([nestedBase, nestedDerived]) => recurseOf(nestedBase, nestedDerived),
  })

const mergedValueAt = (record: MutableJsonRecord, key: string, derivedVal: Schema.Json): Schema.Json =>
  Match.value(mergeShape(record[key], derivedVal)).pipe(
    Match.tag('Recurse', ({ base, derived }) => mergeConfigObjects(base, derived)),
    Match.tag('Replace', ({ derived }) => derived),
    Match.exhaustive,
  )

const mergeConfigObjects = (
  base: MutableJsonRecord,
  derived: MutableJsonRecord,
): MutableJsonRecord =>
  Object.entries(derived).reduce<MutableJsonRecord>(
    (record, [key, derivedVal]) => ({
      ...record,
      [key]: mergedValueAt(record, key, derivedVal),
    }),
    { ...base },
  )

const decideMerge = (command: MergeConfig): MergeConfigDecision =>
  Match.value(Object.keys(command.base).length === 0).pipe(
    Match.when(true, () => ConfigReplaced.make({ derived: { ...command.derived } })),
    Match.when(false, () => ConfigMerged.make({ merged: mergeConfigObjects(command.base, command.derived) })),
    Match.exhaustive,
  )

export const mergeConfig = Workflow.make({
  command: MergeConfig,
  decision: MergeConfigDecision,
  error: Schema.Never,
  decide: (command: MergeConfig): Result.Result<MergeConfigDecision, never> => Result.succeed(decideMerge(command)),
})
