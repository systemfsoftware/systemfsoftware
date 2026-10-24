import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { ProjectId } from '../../Config/config.schema.js'
import { MergeReports, mergeReports, MergeReportsDecision } from '../merge-reports.workflow.js'
import { Report1, RunId, TestId, TestResult, TestStatus } from '../report.schema.js'

type Merge = typeof mergeReports

const sameDecision = (decision: MergeReportsDecision, other: MergeReportsDecision): boolean =>
  Schema.toEquivalence(MergeReportsDecision)(decision, other)

const decisionOf = (merge: Merge, partials: Arr.NonEmptyReadonlyArray<Report1>): MergeReportsDecision =>
  Result.match(merge(new MergeReports({ partials })), {
    onFailure: (missing: never) => missing,
    onSuccess: (decision) => decision,
  })

// Each result's test id gains the partial's tag and its position, so no two results anywhere share a key.
const keyed = (report: Report1, tag: string): Report1 => ({
  ...report,
  results: report.results.map((result, index) => ({ ...result, test: TestId.make(`${tag}${index}:${result.test}`) })),
})

const withRun = (report: Report1, id: Report1['run']['id'], project: Report1['run']['project']): Report1 => ({
  ...report,
  run: { ...report.run, id, project },
})

const mergedReportOf = (decision: MergeReportsDecision): Report1 | undefined =>
  Match.valueTags(decision, {
    ReportsMerged: ({ report }) => report,
    RunsDisagree: () => undefined,
    ResultsOverlap: () => undefined,
  })

it.prop(
  '∀a,b_DisjointPartialsOfOneRun_≡SameMergeInEitherOrder',
  { of: [Report1, Report1], subject: mergeReports, runs: 50, arbitrary: { seed: 508_201 } },
  (merge, [a, b]) => {
    const left = keyed(a, 'a')
    const right = withRun(keyed(b, 'b'), a.run.id, a.run.project)
    const forward = decisionOf(merge, [left, right])
    return mergedReportOf(forward)?.results.length === a.results.length + b.results.length &&
      sameDecision(forward, decisionOf(merge, [right, left]))
  },
)

it.prop(
  '∀a,b_MergedSummary_≡CountsOfMergedResults',
  { of: [Report1, Report1], subject: mergeReports, runs: 50, arbitrary: { seed: 508_202 } },
  (merge, [a, b]) => {
    const report = mergedReportOf(decisionOf(merge, [keyed(a, 'a'), withRun(keyed(b, 'b'), a.run.id, a.run.project)]))
    return report !== undefined && report.summary.tests === a.results.length + b.results.length &&
      TestStatus.literals.every((status) =>
        report.summary[status] === report.results.filter((result) => result.status === status).length
      )
  },
)

it.prop(
  '∀a,b_DifferentRunIds_≡RunsDisagreeOnId',
  { of: [Report1, Report1], subject: mergeReports, runs: 50, arbitrary: { seed: 508_203 } },
  (merge, [a, b]) =>
    sameDecision(
      decisionOf(merge, [a, withRun(b, RunId.make(`${a.run.id}+other`), a.run.project)]),
      MergeReportsDecision.members[1].make({ field: 'id' }),
    ),
)

it.prop(
  '∀a,b_DifferentProjects_≡RunsDisagreeOnProject',
  { of: [Report1, Report1], subject: mergeReports, runs: 50, arbitrary: { seed: 508_204 } },
  (merge, [a, b]) =>
    sameDecision(
      decisionOf(merge, [a, withRun(b, a.run.id, ProjectId.make(a.run.project === 'p' ? 'q' : 'p'))]),
      MergeReportsDecision.members[1].make({ field: 'project' }),
    ),
)

it.prop(
  '∀a,b,r_ResultInBothPartials_≡ResultsOverlapNamingIt',
  { of: [Report1, Report1, TestResult], subject: mergeReports, runs: 50, arbitrary: { seed: 508_205 } },
  (merge, [a, b, shared]) => {
    const left = keyed(a, 'a')
    const right = withRun(keyed(b, 'b'), a.run.id, a.run.project)
    return sameDecision(
      decisionOf(merge, [
        { ...left, results: [...left.results, shared] },
        { ...right, results: [...right.results, shared] },
      ]),
      MergeReportsDecision.members[2].make({ test: shared.test, target: shared.target, agent: shared.agent }),
    )
  },
)
