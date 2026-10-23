import * as Schema from 'effect/Schema'

import { ProjectId } from '../Config/config.schema.js'
import { ConfigName } from '../Config/names.schema.js'
import { FailureRecord } from '../verdict/failure.schema.js'
import { ExitCode, RunStatus } from '../verdict/run-verdict.schema.js'
import { Count, StepRecord } from '../verdict/step-record.schema.js'

const TargetName = ConfigName.pipe(Schema.brand('TargetName'))

export const RunId = Schema.String.pipe(Schema.brand('RunId'))
export type RunId = typeof RunId.Type

export const AttemptId = Schema.String.pipe(Schema.brand('AttemptId'))
export type AttemptId = typeof AttemptId.Type

export const TestId = Schema.String.pipe(Schema.brand('TestId'))
export type TestId = typeof TestId.Type

export const TestStatus = Schema.Literals(['passed', 'failed', 'blocked', 'error', 'interrupted', 'skipped'])
export type TestStatus = typeof TestStatus.Type

export const CacheCounts = Schema.Struct({ replayed: Count, handedOff: Count, missed: Count })
export type CacheCounts = typeof CacheCounts.Type

export const ArtifactRef = Schema.Struct({
  kind: Schema.Literals(['screenshot', 'screen-text', 'trace-page', 'ai-trace']),
  path: Schema.String,
})
export type ArtifactRef = typeof ArtifactRef.Type

export const RanAttempt = Schema.TaggedStruct('Ran', {
  id: AttemptId,
  retry: Count,
  status: RunStatus,
  steps: Schema.Array(StepRecord),
  errors: Schema.Array(FailureRecord),
})
export type RanAttempt = typeof RanAttempt.Type

/** A test that never ran on this target, and why. */
export const SkippedAttempt = Schema.TaggedStruct('Skipped', {
  id: AttemptId,
  retry: Count,
  reason: Schema.String.check(Schema.isPattern(/\S/u, { message: 'a skip reason names why the test did not run' })),
})
export type SkippedAttempt = typeof SkippedAttempt.Type

export const Attempt = Schema.Union([RanAttempt, SkippedAttempt]).pipe(Schema.toTaggedUnion('_tag'))
export type Attempt = typeof Attempt.Type

export const TestResult = Schema.Struct({
  test: TestId,
  title: Schema.String,
  file: Schema.String,
  target: TargetName,
  agent: ConfigName,
  status: TestStatus,
  attempts: Schema.Array(Attempt),
  cache: CacheCounts,
  artifacts: Schema.Array(ArtifactRef),
  tracePath: Schema.optionalKey(Schema.String),
})
export type TestResult = typeof TestResult.Type

export const RunRecord = Schema.Struct({
  id: RunId,
  project: ProjectId,
  status: RunStatus,
  exitCode: ExitCode,
  startedAt: Schema.DateTimeUtcFromString,
  finishedAt: Schema.DateTimeUtcFromString,
  errors: Schema.Array(FailureRecord),
})
export type RunRecord = typeof RunRecord.Type

export const RunSummary = Schema.Struct({
  tests: Count,
  passed: Count,
  failed: Count,
  blocked: Count,
  error: Count,
  interrupted: Count,
  skipped: Count,
  cache: CacheCounts,
})
export type RunSummary = typeof RunSummary.Type

export const Report1 = Schema.Struct({
  schema: Schema.Literal('report-1'),
  run: RunRecord,
  results: Schema.Array(TestResult),
  summary: RunSummary,
})
export type Report1 = typeof Report1.Type
