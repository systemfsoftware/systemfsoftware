import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import * as Equal from 'effect/Equal'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

export type MutableJsonRecord = Record<string, Schema.Json>

const isConfigRecord = (u: Schema.Json): u is MutableJsonRecord =>
  typeof u === 'object' && u !== null && !Array.isArray(u)

const asConfigRecord = (value: Schema.Json | undefined): Option.Option<MutableJsonRecord> =>
  Option.match(Option.fromNullishOr(value), {
    onNone: () => Option.none(),
    onSome: (present) => (isConfigRecord(present) ? Option.some(present) : Option.none()),
  })

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

export type MergeConfigDecision = ConfigMerged | ConfigReplaced

export class MergeConfig extends Schema.TaggedClass<MergeConfig>()('MergeConfig', {
  base: Schema.Record(Schema.String, Schema.Json),
  derived: Schema.Record(Schema.String, Schema.Json),
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
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

const mergeKey = (
  result: MutableJsonRecord,
  key: string,
  derivedVal: Schema.Json,
): void => {
  result[key] = Match.value(mergeShape(result[key], derivedVal)).pipe(
    Match.tag('Recurse', ({ base, derived }) => mergeConfigObjects(base, derived)),
    Match.tag('Replace', ({ derived }) => derived),
    Match.exhaustive,
  )
}
const mergeConfigObjects = (
  base: MutableJsonRecord,
  derived: MutableJsonRecord,
): MutableJsonRecord => {
  const result: MutableJsonRecord = { ...base }
  for (const [key, val] of Object.entries(derived)) {
    mergeKey(result, key, val)
  }
  return result
}

const decideMerge = (command: MergeConfig): MergeConfigDecision =>
  Match.value(Object.keys(command.base).length === 0).pipe(
    Match.when(true, () => ConfigReplaced.make({ derived: { ...command.derived } })),
    Match.when(false, () => ConfigMerged.make({ merged: mergeConfigObjects(command.base, command.derived) })),
    Match.exhaustive,
  )

export const mergeConfig = Workflow.total(
  MergeConfig,
  (command: MergeConfig): Result.Result<MergeConfigDecision, never> => Result.succeed(decideMerge(command)),
)

if (import.meta.vitest !== void 0) {
  // Exception: in-source tests load @effect/vitest dynamically to avoid bundling test libraries
  const { it } = await import('@effect/vitest')
  const { Schema: S } = await import('effect')

  const ArraysRecord = S.Struct({
    alpha: S.Array(S.String),
    beta: S.Array(S.String),
  })

  const ObjectsRecord = S.Struct({
    nested: ArraysRecord,
    alpha: S.Array(S.String),
  })

  it.prop(
    '∀a,b_ArrayReplace_≡RightBiased',
    [ArraysRecord, ArraysRecord],
    ([base, derived]) => Equal.equals(mergeConfigObjects(base, derived), { ...base, ...derived }),
  )

  it.prop(
    '∀a,b,c_ArrayReplace_≡Associative',
    [ArraysRecord, ArraysRecord, ArraysRecord],
    ([a, b, c]) =>
      Equal.equals(
        mergeConfigObjects(mergeConfigObjects(a, b), c),
        mergeConfigObjects(a, mergeConfigObjects(b, c)),
      ),
  )

  it.prop(
    '∀a,b,c_ObjectMerge_≡Associative',
    [ObjectsRecord, ObjectsRecord, ObjectsRecord],
    ([a, b, c]) =>
      Equal.equals(
        mergeConfigObjects(mergeConfigObjects(a, b), c),
        mergeConfigObjects(a, mergeConfigObjects(b, c)),
      ),
  )
}
