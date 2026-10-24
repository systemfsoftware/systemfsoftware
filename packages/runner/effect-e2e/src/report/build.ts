import * as Arr from 'effect/Array'
import type * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'

import type { AttemptEntry } from '../run/attempt.js'
import { finalVerdictOf } from '../verdict/exit-code.js'
import type { CacheLookup, StepRecord } from '../verdict/step-record.schema.js'
import {
  type ArtifactRef,
  type Attempt,
  type CacheCounts,
  canonicalErrorsOf,
  type Report1,
  type RunErrors,
  type RunId,
  type RunRecord,
  sortResults,
  summaryOf,
  type TestResult,
  type TestStatus,
} from './report.schema.js'

export interface ReportRun {
  readonly id: RunId
  readonly project: RunRecord['project']
  readonly startedAt: DateTime.Utc
  readonly finishedAt: DateTime.Utc
  readonly errors: RunErrors
}

export interface BuildReportRequest {
  readonly run: ReportRun
  readonly entries: ReadonlyArray<AttemptEntry>
}

const entryKeyOf = (entry: AttemptEntry): string => JSON.stringify([entry.test.id, entry.target, entry.agent])

const statusOf = (attempt: Attempt): TestStatus =>
  Match.valueTags(attempt, { Ran: ({ status }): TestStatus => status, Skipped: (): TestStatus => 'skipped' })

const lookupsOf = (step: StepRecord): ReadonlyArray<CacheLookup> =>
  Match.value(step).pipe(
    Match.tag('ActStep', 'AssertStep', 'WaitForStep', 'ExtractStep', ({ cache }) => [cache.lookup]),
    Match.orElse(() => []),
  )

const stepsOf = (attempt: Attempt): ReadonlyArray<StepRecord> =>
  Match.valueTags(attempt, { Ran: ({ steps }) => steps, Skipped: () => [] })

const cacheCountsOf = (attempts: ReadonlyArray<Attempt>): CacheCounts => {
  const lookups = Arr.flatMap(Arr.flatMap(attempts, stepsOf), lookupsOf)
  return {
    replayed: Arr.filter(lookups, Predicate.isTagged('Replayed')).length,
    handedOff: Arr.filter(lookups, Predicate.isTagged('HandedOff')).length,
    missed: Arr.filter(lookups, Predicate.isTagged('Missed')).length,
  }
}

const isTracePage = (artifact: ArtifactRef): boolean => artifact.kind === 'trace-page'

const tracePathOf = (artifacts: ReadonlyArray<ArtifactRef>): { readonly tracePath?: string } =>
  Option.match(Arr.findFirst(artifacts, isTracePage), {
    onNone: () => ({}),
    onSome: (trace) => ({ tracePath: trace.path }),
  })

const resultOf = (group: Arr.NonEmptyReadonlyArray<AttemptEntry>): TestResult => {
  const final = Arr.lastNonEmpty(group)
  const attempts = Arr.map(group, (entry) => entry.attempt)
  return {
    test: final.test.id,
    title: final.test.title,
    file: final.test.file,
    target: final.target,
    agent: final.agent,
    status: statusOf(final.attempt),
    attempts,
    cache: cacheCountsOf(attempts),
    artifacts: final.artifacts,
    ...tracePathOf(final.artifacts),
  }
}

const finalAttemptOf = (result: TestResult): ReadonlyArray<Attempt> => Arr.takeRight(result.attempts, 1)

export const buildReport = (request: BuildReportRequest): Report1 => {
  const results = sortResults(Arr.map(Object.values(Arr.groupBy(request.entries, entryKeyOf)), resultOf))
  const errors = canonicalErrorsOf(request.run.errors)
  const verdict = finalVerdictOf({ finals: Arr.flatMap(results, finalAttemptOf), runErrors: errors })
  return {
    schema: 'report-1',
    run: {
      id: request.run.id,
      project: request.run.project,
      status: verdict.status,
      exitCode: verdict.exitCode,
      startedAt: request.run.startedAt,
      finishedAt: request.run.finishedAt,
      errors,
    },
    results,
    summary: summaryOf(results),
  }
}
