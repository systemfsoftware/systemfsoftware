import * as Schema from 'effect/Schema'

import { Action } from '../engine/action.schema.js'
import { NodeRef } from '../engine/semantic-node.schema.js'
import { CheckRecord } from './check.schema.js'
import { Evidence, FailureCode, FailureRecord } from './failure.schema.js'

export const StepId = Schema.String.pipe(Schema.brand('StepId'))
export type StepId = typeof StepId.Type

export const Count = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, { message: 'a count is a whole number of at least 0' }),
)

export const TokenUsage = Schema.Struct({ input: Count, output: Count })
export type TokenUsage = typeof TokenUsage.Type

export const ActionRecord = Schema.Struct({ action: Action, located: Schema.Array(NodeRef) })
export type ActionRecord = typeof ActionRecord.Type

export const CacheLookup = Schema.Union([
  Schema.TaggedStruct('Replayed', {}),
  Schema.TaggedStruct('HandedOff', { reason: Schema.String }),
  Schema.TaggedStruct('Missed', {}),
  Schema.TaggedStruct('Off', {}),
]).pipe(Schema.toTaggedUnion('_tag'))
export type CacheLookup = typeof CacheLookup.Type

export const CacheWrite = Schema.Literals(['saved', 'kept', 'unconfirmed', 'evicted', 'no-change', 'not-written'])
export type CacheWrite = typeof CacheWrite.Type

export const StepCacheInfo = Schema.Struct({ lookup: CacheLookup, write: CacheWrite })
export type StepCacheInfo = typeof StepCacheInfo.Type

export const StepOutcome = Schema.Union([
  Schema.TaggedStruct('Passed', {}),
  Schema.TaggedStruct('Skipped', { reason: Schema.String }),
  Schema.TaggedStruct('Inconclusive', { code: FailureCode, evidence: Evidence }),
  Schema.TaggedStruct('Failed', FailureRecord.fields),
]).pipe(Schema.toTaggedUnion('_tag'))
export type StepOutcome = typeof StepOutcome.Type

export const StepRecord = Schema.Union([
  Schema.TaggedStruct('ActStep', {
    id: StepId,
    instruction: Schema.String,
    params: Schema.JsonObject,
    actions: Schema.Array(ActionRecord),
    summary: Schema.String,
    outcome: StepOutcome,
    cache: StepCacheInfo,
    modelCalls: Count,
    tokens: TokenUsage,
  }),
  Schema.TaggedStruct('AssertStep', {
    id: StepId,
    record: CheckRecord,
    outcome: StepOutcome,
    cache: StepCacheInfo,
    modelCalls: Count,
    tokens: TokenUsage,
  }),
  Schema.TaggedStruct('WaitForStep', {
    id: StepId,
    record: CheckRecord,
    outcome: StepOutcome,
    cache: StepCacheInfo,
    modelCalls: Count,
    tokens: TokenUsage,
  }),
  Schema.TaggedStruct('ExtractStep', {
    id: StepId,
    schemaId: Schema.String,
    result: Schema.Json,
    outcome: StepOutcome,
    cache: StepCacheInfo,
    modelCalls: Count,
    tokens: TokenUsage,
  }),
  Schema.TaggedStruct('LocatorStep', {
    id: StepId,
    matcher: Schema.String,
    expected: Schema.String,
    observed: Schema.String,
    outcome: StepOutcome,
  }),
  Schema.TaggedStruct('ValueStep', {
    id: StepId,
    matcher: Schema.String,
    expected: Schema.String,
    observed: Schema.String,
    outcome: StepOutcome,
  }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type StepRecord = typeof StepRecord.Type
