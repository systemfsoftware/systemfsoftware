/**
 * Config — pure decision for merging config documents.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class MergeCommand extends S.TaggedClass<MergeCommand>()('MergeCommand', {
  base: S.Record(S.String, S.Unknown),
  overrides: S.Record(S.String, S.Unknown),
}) {}

export class MergeResult extends S.TaggedClass<MergeResult>()('MergeResult', {
  merged: S.Record(S.String, S.Unknown),
}) {}

export class MergeError extends S.TaggedError<MergeError>()('MergeError', {
  message: S.String,
}) {}

/**
 * Pure record merge for config documents.
 *
 * Merge is associative, right-biased on scalar collision, and recursive on
 * plain objects. Arrays and non-records are replaced wholesale (right wins).
 * `null` handling and `plugins` deduplication are in `Config.ts:mergeConfigs`,
 * which adds config-specific rules on top. This file is the generic associative
 * merge the property test covers.
 */
function mergeRecords(
  base: object,
  overrides: object,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.assign(out, base)
  for (const [key, overrideValueAny] of Object.entries(overrides)) {
    const overrideValue: unknown = overrideValueAny
    if (key === '__proto__') continue
    if (overrideValue === undefined) continue
    const baseValue: unknown = out[key]
    if (
      baseValue === undefined ||
      typeof baseValue !== 'object' ||
      typeof overrideValue !== 'object' ||
      baseValue === null ||
      overrideValue === null ||
      Array.isArray(baseValue) ||
      Array.isArray(overrideValue)
    ) {
      out[key] = overrideValue
    } else {
      const merged = mergeRecords(baseValue, overrideValue)
      out[key] = merged
    }
  }
  return out
}

export const mergeConfigsWorkflow = Workflow.make(MergeCommand, (command): Result.Result<MergeResult, MergeError> => {
  const merged = mergeRecords(command.base, command.overrides)
  return Result.succeed(new MergeResult({ merged }))
})
