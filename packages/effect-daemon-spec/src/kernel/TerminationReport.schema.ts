import { Schema } from 'effect'
import { ChildId, Generation, ProbeThreshold } from './SupervisionLimits.schema.js'

/**
 * What a medium can say about why a child died (R16): a fiber supplies a cause, a process
 * supplies an exit status and signal, and a remote runner's death is inferred. No event
 * claims a level its medium cannot supply — the medium declares which one it reports, and
 * the kernel assumes nothing beyond that declaration.
 */
export const CauseReport = Schema.TaggedStruct('CauseReport', { cause: Schema.String })
export type CauseReport = typeof CauseReport.Type

export const ExitReport = Schema.TaggedStruct('ExitReport', { code: Schema.Int, signal: Schema.String })
export type ExitReport = typeof ExitReport.Type

export const InferredReport = Schema.TaggedStruct('InferredReport', { failedProbes: ProbeThreshold })
export type InferredReport = typeof InferredReport.Type

export const DeadlineMissedReport = Schema.TaggedStruct('DeadlineMissed', { waitedMillis: Schema.Int })
export type DeadlineMissedReport = typeof DeadlineMissedReport.Type

export const FailureReport = Schema.Union([CauseReport, ExitReport, InferredReport, DeadlineMissedReport])
export type FailureReport = typeof FailureReport.Type

export const NormalTermination = Schema.TaggedStruct('Normal', {})
export type NormalTermination = typeof NormalTermination.Type

export const ShutdownTermination = Schema.TaggedStruct('Shutdown', {})
export type ShutdownTermination = typeof ShutdownTermination.Type

export const AbnormalTermination = Schema.TaggedStruct('Abnormal', { report: FailureReport })
export type AbnormalTermination = typeof AbnormalTermination.Type

export const TerminationReason = Schema.Union([NormalTermination, ShutdownTermination, AbnormalTermination])
export type TerminationReason = typeof TerminationReason.Type

/**
 * Why the supervisor itself is terminating: a shutdown something asked of it, or a
 * give-up after its children terminated more often than its intensity allows. The
 * decision and command data carry this, so the shell never infers which one it is.
 * A give-up names the child incarnation whose termination exhausted the intensity.
 */
export const RequestedExit = Schema.TaggedStruct('RequestedExit', {})
export type RequestedExit = typeof RequestedExit.Type

export const IntensityExceededExit = Schema.TaggedStruct('IntensityExceededExit', {
  childId: ChildId,
  generation: Generation,
})
export type IntensityExceededExit = typeof IntensityExceededExit.Type

export const SupervisorExit = Schema.Union([RequestedExit, IntensityExceededExit])
export type SupervisorExit = typeof SupervisorExit.Type
