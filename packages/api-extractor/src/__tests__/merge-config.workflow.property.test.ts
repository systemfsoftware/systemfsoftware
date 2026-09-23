import { it } from '@effect/vitest'
import { Equal, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

import { MergeConfig, mergeConfig } from '../config/merge-config.workflow.js'

type JsonRecord = Record<string, Schema.Json>

const isJsonRecord = (value: Schema.Json | undefined): value is JsonRecord =>
  Match.value({ object: typeof value === 'object', nonNull: value !== null, list: Array.isArray(value) }).pipe(
    Match.when({ object: true, nonNull: true, list: false }, () => true),
    Match.orElse(() => false),
  )

const mergedOf = (base: JsonRecord, derived: JsonRecord): JsonRecord =>
  Match.value(Result.merge(mergeConfig(MergeConfig.make({ base, derived })))).pipe(
    Match.tag('ConfigMerged', (merged): JsonRecord => merged.merged),
    Match.tag('ConfigReplaced', (replaced): JsonRecord => replaced.derived),
    Match.exhaustive,
  )

const preservesDeeperPaths = (
  base: Schema.Json | undefined,
  derived: Schema.Json | undefined,
  merged: Schema.Json | undefined,
): boolean => {
  if (!isJsonRecord(base) || !isJsonRecord(derived)) return Equal.equals(merged, derived)
  if (!isJsonRecord(merged)) return false
  const recurse = (key: string): boolean => preservesDeeperPaths(base[key], derived[key], merged[key])
  return Object.keys(base).every((key) => Object.hasOwn(derived, key) || Equal.equals(merged[key], base[key])) &&
    Object.keys(derived).every(recurse)
}

it.prop('∀a,b_DeeperPaths_≡Preserved', [
  Schema.Record(Schema.String, Schema.Json),
  Schema.Record(Schema.String, Schema.Json),
], ([base, derived]) => preservesDeeperPaths(base, derived, mergedOf(base, derived)))

it.prop(
  '∀a_Merge_≡Idempotent',
  [Schema.Record(Schema.String, Schema.Json)],
  ([record]) => Equal.equals(mergedOf(record, record), record),
)

it.prop(
  '∀a,b,c_FlatValues_≡Associative',
  [
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
  ],
  ([a, b, c]) => Equal.equals(mergedOf(mergedOf(a, b), c), mergedOf(a, mergedOf(b, c))),
)
