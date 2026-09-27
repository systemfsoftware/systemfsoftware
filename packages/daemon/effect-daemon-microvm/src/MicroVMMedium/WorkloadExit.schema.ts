import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Match, Schema } from 'effect'

const WorkloadExitTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-microvm/WorkloadExit')
type WorkloadExitTypeId = typeof WorkloadExitTypeId

export class WorkloadExitedNormal extends Schema.TaggedClass<WorkloadExitedNormal>()('WorkloadExitedNormal', {}) {
  readonly [WorkloadExitTypeId] = WorkloadExitTypeId
}

export class WorkloadExitedAbnormal extends Schema.TaggedClass<WorkloadExitedAbnormal>()('WorkloadExitedAbnormal', {
  code: Schema.Int,
}) {
  readonly [WorkloadExitTypeId] = WorkloadExitTypeId
}

export const WorkloadExit = Schema.Union([WorkloadExitedNormal, WorkloadExitedAbnormal])
export type WorkloadExit = typeof WorkloadExit.Type

const UNREPORTED_SIGNAL = 'unreported'

export const terminationReasonOf = (exit: WorkloadExit): Supervisor.Medium.TerminationReason =>
  Match.value(exit).pipe(
    Match.tag(
      'WorkloadExitedNormal',
      (): Supervisor.Medium.TerminationReason => Supervisor.Medium.NormalTermination.make({}),
    ),
    Match.tag(
      'WorkloadExitedAbnormal',
      (abnormal): Supervisor.Medium.TerminationReason =>
        Supervisor.Medium.AbnormalTermination.make({
          report: Supervisor.Medium.ExitReport.make({ code: abnormal.code, signal: UNREPORTED_SIGNAL }),
        }),
    ),
    Match.exhaustive,
  )
