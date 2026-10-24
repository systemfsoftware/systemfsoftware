import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { ExitCode, RunStatus } from '../verdict/run-verdict.schema.js'
import {
  canonicalErrorsOf,
  Report1,
  type RunRecord,
  sameResultAs,
  sortResults,
  summaryOf,
  TestId,
  type TestResults,
} from './report.schema.js'

const MergeReportsDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/MergeReportsDecision')

export class MergeReports extends Schema.TaggedClass<MergeReports>()('MergeReports', {
  partials: Schema.NonEmptyArray(Report1),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class ReportsMerged extends Schema.TaggedClass<ReportsMerged>()('ReportsMerged', { report: Report1 }) {
  readonly [MergeReportsDecisionTypeId] = MergeReportsDecisionTypeId
}

export class RunsDisagree extends Schema.TaggedClass<RunsDisagree>()('RunsDisagree', {
  field: Schema.Literals(['id', 'project']),
}) {
  readonly [MergeReportsDecisionTypeId] = MergeReportsDecisionTypeId
}

export class ResultsOverlap extends Schema.TaggedClass<ResultsOverlap>()('ResultsOverlap', {
  test: TestId,
  target: Schema.String,
  agent: Schema.String,
}) {
  readonly [MergeReportsDecisionTypeId] = MergeReportsDecisionTypeId
}

export const MergeReportsDecision = Schema.Union([ReportsMerged, RunsDisagree, ResultsOverlap])
export type MergeReportsDecision = typeof MergeReportsDecision.Type

const STATUS_WEIGHT: { readonly [Status in RunStatus]: number } = {
  passed: 0,
  blocked: 1,
  failed: 2,
  error: 3,
  interrupted: 4,
}

const EXIT_CODE: { readonly [Status in RunStatus]: ExitCode } = {
  passed: 0,
  failed: 1,
  blocked: 3,
  error: 4,
  interrupted: 130,
}

const byWeight: Order.Order<RunStatus> = Order.mapInput(Order.Number, (status) => STATUS_WEIGHT[status])

const byStart: Order.Order<RunRecord> = Order.mapInput(Order.Number, (run) => run.startedAt.epochMilliseconds)

const byFinish: Order.Order<RunRecord> = Order.mapInput(Order.Number, (run) => run.finishedAt.epochMilliseconds)

const disagreementOf = (runs: Arr.NonEmptyReadonlyArray<RunRecord>): Option.Option<MergeReportsDecision> =>
  Option.orElse(
    Option.as(
      Arr.findFirst(runs, (run) => run.id !== Arr.headNonEmpty(runs).id),
      new RunsDisagree({ field: 'id' }),
    ),
    () =>
      Option.as(
        Arr.findFirst(runs, (run) => run.project !== Arr.headNonEmpty(runs).project),
        new RunsDisagree({ field: 'project' }),
      ),
  )

const overlapOf = (results: TestResults): Option.Option<MergeReportsDecision> =>
  Option.map(
    Arr.findFirst(results, (result, index) =>
      Arr.findLastIndex(results, sameResultAs(result)).pipe(
        Option.exists((last) => last !== index),
      )),
    (result) => new ResultsOverlap({ test: result.test, target: result.target, agent: result.agent }),
  )

const mergedOf = (runs: Arr.NonEmptyReadonlyArray<RunRecord>, results: TestResults): MergeReportsDecision => {
  const first = Arr.headNonEmpty(runs)
  const status = Arr.max(Arr.map(runs, (run) => run.status), byWeight)
  const sorted = sortResults(results)
  return new ReportsMerged({
    report: {
      schema: 'report-1',
      run: {
        id: first.id,
        project: first.project,
        status,
        exitCode: EXIT_CODE[status],
        startedAt: Arr.min(runs, byStart).startedAt,
        finishedAt: Arr.max(runs, byFinish).finishedAt,
        errors: canonicalErrorsOf(Arr.flatMap(runs, (run) => run.errors)),
      },
      results: sorted,
      summary: summaryOf(sorted),
    },
  })
}

const decideMerge = (command: MergeReports): Result.Result<MergeReportsDecision, never> => {
  const runs = Arr.map(command.partials, (partial) => partial.run)
  const results = Arr.flatMap(command.partials, (partial) => partial.results)
  return Result.succeed(
    disagreementOf(runs).pipe(
      Option.orElse(() => overlapOf(results)),
      Option.getOrElse(() => mergedOf(runs, results)),
    ),
  )
}

export const mergeReports = Workflow.make({
  command: MergeReports,
  decision: MergeReportsDecision,
  error: Schema.Never,
  decide: decideMerge,
})
