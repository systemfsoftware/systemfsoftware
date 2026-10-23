import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Schema from 'effect/Schema'

import { ProjectId } from '../Config/config.schema.js'
import { ConfigName } from '../Config/names.schema.js'
import { FailureRecord } from '../verdict/failure.schema.js'
import { ExitCode, RunStatus } from '../verdict/run-verdict.schema.js'
import { Count, type StepOutcome, StepRecord } from '../verdict/step-record.schema.js'

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

export const ArtifactKind = Schema.Literals(['screenshot', 'screen-text', 'trace-page', 'ai-trace'])
export type ArtifactKind = typeof ArtifactKind.Type

export const ArtifactRef = Schema.Struct({ kind: ArtifactKind, path: Schema.String })
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

export const TestResults = Schema.Array(TestResult)
export type TestResults = typeof TestResults.Type

export const RunErrors = Schema.Array(FailureRecord)
export type RunErrors = typeof RunErrors.Type

export const RunRecord = Schema.Struct({
  id: RunId,
  project: ProjectId,
  status: RunStatus,
  exitCode: ExitCode,
  startedAt: Schema.DateTimeUtcFromString,
  finishedAt: Schema.DateTimeUtcFromString,
  errors: RunErrors,
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
  results: TestResults,
  summary: RunSummary,
})
export type Report1 = typeof Report1.Type

const resultKeyOf = (result: TestResult): string => JSON.stringify([result.test, result.target, result.agent])

export const sameResultAs = (result: TestResult) => (other: TestResult): boolean =>
  resultKeyOf(result) === resultKeyOf(other)

const byResultKey = Order.mapInput(Order.String, resultKeyOf)

export const sortResults = (results: TestResults): TestResults => Arr.sort(results, byResultKey)

const byEncoding = Order.mapInput(Order.String, (error: RunErrors[number]) => JSON.stringify(error))

/** Run errors are a multiset; a canonical order makes two reports of the same errors equal. */
export const canonicalErrorsOf = (errors: RunErrors): RunErrors => Arr.sort(errors, byEncoding)

const countOf = (results: ReadonlyArray<TestResult>, status: TestStatus): number =>
  Arr.filter(results, (result) => result.status === status).length

const sumOf = (results: ReadonlyArray<TestResult>, field: keyof CacheCounts): number =>
  Arr.reduce(results, 0, (total, result) => total + result.cache[field])

/** The summary is counted from the results, never carried, so it cannot disagree with them. */
export const summaryOf = (results: ReadonlyArray<TestResult>): RunSummary => ({
  tests: results.length,
  passed: countOf(results, 'passed'),
  failed: countOf(results, 'failed'),
  blocked: countOf(results, 'blocked'),
  error: countOf(results, 'error'),
  interrupted: countOf(results, 'interrupted'),
  skipped: countOf(results, 'skipped'),
  cache: {
    replayed: sumOf(results, 'replayed'),
    handedOff: sumOf(results, 'handedOff'),
    missed: sumOf(results, 'missed'),
  },
})

const outcomeCodesOf = (outcome: StepOutcome): ReadonlyArray<string> =>
  Match.valueTags(outcome, {
    Passed: () => [],
    Skipped: () => [],
    Inconclusive: ({ code }) => [code],
    Failed: ({ code }) => [code],
  })

const attemptReasonOf = (attempt: Attempt): Option.Option<string> =>
  Match.valueTags(attempt, {
    Ran: ({ steps, errors }) =>
      Arr.head([
        ...Arr.flatMap(steps, (step) => outcomeCodesOf(step.outcome)),
        ...Arr.map(errors, (error) => error.code),
      ]),
    Skipped: ({ reason }) => Option.some(reason),
  })

export const finalReasonOf = (result: TestResult): string =>
  Option.getOrElse(Option.flatMap(Arr.last(result.attempts), attemptReasonOf), () => result.status)
