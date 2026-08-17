import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Result from 'effect/Result'
import type { AdmitSurvivorsRunInput } from './survivors.kernel.js'
import { admitSurvivorsRun, type SurvivorsAdmission, SurvivorsRejection } from './survivors.workflow.js'

/** The run context the admission's later phases need, threaded beside the decision. */
interface AdmissionRunContext {
  readonly resolvedOptions: StrykerOptions
  readonly priorReportPath: string
}

/** The admission workflow's input plus the run context the later phases need. */
export interface AdmissionDecoded extends AdmissionRunContext {
  readonly input: AdmitSurvivorsRunInput
}

/** The admission decision plus the run context the write dispatches on. */
export interface AdmissionOutcome extends AdmissionRunContext {
  readonly decision: SurvivorsAdmission
}

/**
 * Maps the survivors admission workflow's outcome into the admission outcome,
 * carrying the run context forward for the write phase.
 */
export const admissionAdapter = Workflow.make(
  (
    { input, resolvedOptions, priorReportPath }: AdmissionDecoded,
  ): Result.Result<AdmissionOutcome, SurvivorsRejection> =>
    Result.map(admitSurvivorsRun(input), (decision) => ({ decision, resolvedOptions, priorReportPath })),
)
