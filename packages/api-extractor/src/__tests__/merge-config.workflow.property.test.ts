import { it } from '@effect/vitest'
import { Equal, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

import {
  ConfigMerged,
  ConfigReplaced,
  MergeConfig,
  mergeConfig,
  type MergeConfigDecision,
} from '../config/merge-config.workflow.js'

const ArraysRecord = Schema.Struct({
  alpha: Schema.Array(Schema.String),
  beta: Schema.Array(Schema.String),
})

const ObjectsRecord = Schema.Struct({
  nested: ArraysRecord,
  alpha: Schema.Array(Schema.String),
})

const decisionOf = (
  base: Record<string, Schema.Json>,
  derived: Record<string, Schema.Json>,
): MergeConfigDecision => Result.getOrThrow(mergeConfig(MergeConfig.make({ base, derived })))

const mergedOf = (
  base: Record<string, Schema.Json>,
  derived: Record<string, Schema.Json>,
): Record<string, Schema.Json> =>
  Match.value(decisionOf(base, derived)).pipe(
    Match.tag('ConfigMerged', (merged) => merged.merged),
    Match.tag('ConfigReplaced', (replaced) => replaced.derived),
    Match.exhaustive,
  )

it.prop(
  '∀a,b_ArrayReplace_≡RightBiased',
  [ArraysRecord, ArraysRecord],
  ([base, derived]) => Equal.equals(mergedOf(base, derived), { ...base, ...derived }),
)

it.prop(
  '∀a,b,c_ArrayReplace_≡Associative',
  [ArraysRecord, ArraysRecord, ArraysRecord],
  ([a, b, c]) =>
    Equal.equals(
      mergedOf(mergedOf(a, b), c),
      mergedOf(a, mergedOf(b, c)),
    ),
)

const isConfigRecord = (value: Schema.Json | undefined): value is Record<string, Schema.Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

it.prop(
  '∀a,b_ObjectMerge_≡DeepRightBiased',
  [ObjectsRecord, ObjectsRecord],
  ([base, derived]) => {
    const merged = mergedOf(base, derived)
    const mergedNested = merged['nested']
    const derivedNested = derived['nested']
    return isConfigRecord(mergedNested) && isConfigRecord(derivedNested) &&
      merged['alpha'] === derived['alpha'] &&
      mergedNested['alpha'] === derivedNested['alpha'] &&
      mergedNested['beta'] === derivedNested['beta']
  },
)

it.prop(
  '∀a,b,c_ObjectMerge_≡Associative',
  [ObjectsRecord, ObjectsRecord, ObjectsRecord],
  ([a, b, c]) =>
    Equal.equals(
      mergedOf(mergedOf(a, b), c),
      mergedOf(a, mergedOf(b, c)),
    ),
)
