import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Result } from 'effect'
import { dual } from 'effect/Function'
import { CompareTraces, compareTraces, type TraceComparison } from './compare-traces.workflow.js'
import { ProjectTrace, projectTrace } from './project-trace.workflow.js'
import type { ConformanceTrace, ObservedStep } from './Trace.schema.js'

type Declaration = Supervisor.Medium.MediumDeclaration

const projectedStepsOf = (trace: ConformanceTrace, declaration: Declaration): ReadonlyArray<ObservedStep> =>
  Result.getOrThrow(projectTrace(new ProjectTrace({ trace, declaration }))).steps

const comparePair = (
  reference: ConformanceTrace,
  candidate: ConformanceTrace,
  declaration: Declaration,
): TraceComparison =>
  Result.getOrThrow(
    compareTraces(
      new CompareTraces({
        scenario: candidate.scenario,
        medium: candidate.medium,
        reference: projectedStepsOf(reference, declaration),
        candidate: projectedStepsOf(candidate, declaration),
      }),
    ),
  )

/**
 * `compare(reference, candidate, declaration)` projects both traces through the
 * candidate's declaration — its reporting level and its group-stop guarantee —
 * and decides whether the candidate reproduced the reference. The mismatch a
 * divergence yields names the scenario, the medium and the first diverging
 * index.
 */
export const compare: {
  (reference: ConformanceTrace, candidate: ConformanceTrace, declaration: Declaration): TraceComparison
  (reference: ConformanceTrace, candidate: ConformanceTrace): (declaration: Declaration) => TraceComparison
} = dual((args) => args.length === 3, comparePair)
