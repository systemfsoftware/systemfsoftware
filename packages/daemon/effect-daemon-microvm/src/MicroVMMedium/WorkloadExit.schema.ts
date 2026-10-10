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

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  const absentSignal = 'unreported'

  it.prop(
    '∀e_WorkloadExit_≡TerminationReason',
    { of: [WorkloadExit], subject: terminationReasonOf },
    (subject, [exit]) =>
      Match.value(exit).pipe(
        Match.tag('WorkloadExitedNormal', () => Schema.is(Supervisor.Medium.NormalTermination)(subject(exit))),
        Match.tag('WorkloadExitedAbnormal', (abnormal) =>
          Match.value(subject(exit)).pipe(
            Match.tag('Abnormal', (reason) =>
              Match.value(reason.report).pipe(
                Match.tag('ExitReport', (report) => report.code === abnormal.code && report.signal === absentSignal),
                Match.orElse(() => false),
              )),
            Match.orElse(() => false),
          )),
        Match.exhaustive,
      ),
  )
}
