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

const mergedOf = (merge: typeof mergeConfig, base: JsonRecord, derived: JsonRecord): JsonRecord =>
  Match.value(merge(MergeConfig.make({ base, derived })).pipe(Result.merge)).pipe(
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

it.prop('∀a,b_DeeperPaths_≡Preserved', {
  of: [Schema.Record(Schema.String, Schema.Json), Schema.Record(Schema.String, Schema.Json)],
  subject: mergeConfig,
}, (subject, [base, derived]) => preservesDeeperPaths(base, derived, mergedOf(subject, base, derived)))

it.prop(
  '∀a_Merge_≡Idempotent',
  { of: [Schema.Record(Schema.String, Schema.Json)], subject: mergeConfig },
  (subject, [record]) => Equal.equals(mergedOf(subject, record, record), record),
)

it.prop(
  '∀a,b,c_FlatValues_≡Associative',
  {
    of: [
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
    ],
    subject: mergeConfig,
  },
  (subject, [a, b, c]) =>
    Equal.equals(mergedOf(subject, mergedOf(subject, a, b), c), mergedOf(subject, a, mergedOf(subject, b, c))),
)
