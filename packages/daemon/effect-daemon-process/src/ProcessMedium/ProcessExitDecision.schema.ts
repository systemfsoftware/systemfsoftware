import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Match, Schema } from 'effect'

const ProcessExitDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-process/ProcessExitDecision',
)
type ProcessExitDecisionTypeId = typeof ProcessExitDecisionTypeId

export class ProcessExitNormal extends Schema.TaggedClass<ProcessExitNormal>()('ProcessExitNormal', {}) {
  readonly [ProcessExitDecisionTypeId] = ProcessExitDecisionTypeId
}

export class ProcessExitAbnormal extends Schema.TaggedClass<ProcessExitAbnormal>()('ProcessExitAbnormal', {
  code: Schema.Int,
  signal: Schema.String,
}) {
  readonly [ProcessExitDecisionTypeId] = ProcessExitDecisionTypeId
}

export const ProcessExitDecision = Schema.Union([ProcessExitNormal, ProcessExitAbnormal])
export type ProcessExitDecision = typeof ProcessExitDecision.Type

const NORMAL: Supervisor.Medium.TerminationReason = { _tag: 'Normal' }

const abnormalExitOf = (code: number, signal: string): Supervisor.Medium.TerminationReason => ({
  _tag: 'Abnormal',
  report: { _tag: 'ExitReport', code, signal },
})

export const terminationReasonOf = (decision: ProcessExitDecision): Supervisor.Medium.TerminationReason =>
  Match.value(decision).pipe(
    Match.tag('ProcessExitNormal', (): Supervisor.Medium.TerminationReason => NORMAL),
    Match.tag(
      'ProcessExitAbnormal',
      (abnormal): Supervisor.Medium.TerminationReason => abnormalExitOf(abnormal.code, abnormal.signal),
    ),
    Match.exhaustive,
  )
