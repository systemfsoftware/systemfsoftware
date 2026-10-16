import { Schema } from 'effect'
import { TimerKind } from './SupervisionEvent.schema.js'
import { ChildId, Deadline, Generation, RequestId } from './SupervisionLimits.schema.js'
import { ShutdownMode } from './SupervisorPolicy.schema.js'
import { SupervisorExit, TerminationReason } from './TerminationReport.schema.js'

export const StartChild = Schema.TaggedStruct('StartChild', { childId: ChildId, generation: Generation })
export type StartChild = typeof StartChild.Type

export const StopChild = Schema.TaggedStruct('StopChild', {
  childId: ChildId,
  generation: Generation,
  shutdown: ShutdownMode,
})
export type StopChild = typeof StopChild.Type

export const ArmChildTimer = Schema.TaggedStruct('ArmChildTimer', {
  kind: TimerKind,
  childId: ChildId,
  generation: Generation,
  deadline: Deadline,
})
export type ArmChildTimer = typeof ArmChildTimer.Type

export const ArmSupervisorTimer = Schema.TaggedStruct('ArmSupervisorTimer', {
  kind: TimerKind,
  deadline: Deadline,
})
export type ArmSupervisorTimer = typeof ArmSupervisorTimer.Type

export const ReplyStartAccepted = Schema.TaggedStruct('ReplyStartAccepted', {
  requestId: RequestId,
  childId: ChildId,
  generation: Generation,
})
export type ReplyStartAccepted = typeof ReplyStartAccepted.Type

export const ReplyStartRefused = Schema.TaggedStruct('ReplyStartRefused', { requestId: RequestId })
export type ReplyStartRefused = typeof ReplyStartRefused.Type

export const ReplyStopped = Schema.TaggedStruct('ReplyStopped', { requestId: RequestId })
export type ReplyStopped = typeof ReplyStopped.Type

export const TerminateSupervisor = Schema.TaggedStruct('TerminateSupervisor', {
  reason: TerminationReason,
  exit: SupervisorExit,
})
export type TerminateSupervisor = typeof TerminateSupervisor.Type

export const SupervisorCommand = Schema.Union([
  StartChild,
  StopChild,
  ArmChildTimer,
  ArmSupervisorTimer,
  ReplyStartAccepted,
  ReplyStartRefused,
  ReplyStopped,
  TerminateSupervisor,
])
export type SupervisorCommand = typeof SupervisorCommand.Type
export const SupervisorArm = Schema.Union([ArmChildTimer, ArmSupervisorTimer])
export type SupervisorArm = typeof SupervisorArm.Type

export const SupervisorReply = Schema.Union([ReplyStartAccepted, ReplyStartRefused, ReplyStopped])
export type SupervisorReply = typeof SupervisorReply.Type

export const SupervisorCommands = Schema.Struct({
  stops: Schema.Array(StopChild),
  starts: Schema.Array(StartChild),
  arms: Schema.Array(SupervisorArm),
  replies: Schema.Array(SupervisorReply),
  terminates: Schema.Array(TerminateSupervisor),
})
export type SupervisorCommands = typeof SupervisorCommands.Type
