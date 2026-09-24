import { Schema } from 'effect'
import { ChildId, EventTime, Generation, RequestId } from './SupervisionLimits.schema.js'
import { TerminationReason } from './TerminationReport.schema.js'

export const TimerKind = Schema.Literals(['start_deadline', 'backoff', 'liveness_tick', 'cool_down'])
export type TimerKind = typeof TimerKind.Type

export const ChildTimerTarget = Schema.TaggedStruct('ChildTimer', { childId: ChildId, generation: Generation })
export type ChildTimerTarget = typeof ChildTimerTarget.Type

export const SupervisorTimerTarget = Schema.TaggedStruct('SupervisorTimer', {})
export type SupervisorTimerTarget = typeof SupervisorTimerTarget.Type

export const TimerTarget = Schema.Union([ChildTimerTarget, SupervisorTimerTarget])
export type TimerTarget = typeof TimerTarget.Type

export const ChildStarted = Schema.TaggedStruct('ChildStarted', {
  at: EventTime,
  childId: ChildId,
  generation: Generation,
})
export type ChildStarted = typeof ChildStarted.Type

export const ChildReady = Schema.TaggedStruct('ChildReady', {
  at: EventTime,
  childId: ChildId,
  generation: Generation,
})
export type ChildReady = typeof ChildReady.Type

export const ChildTerminated = Schema.TaggedStruct('ChildTerminated', {
  at: EventTime,
  childId: ChildId,
  generation: Generation,
  reason: TerminationReason,
})
export type ChildTerminated = typeof ChildTerminated.Type

export const ChildStopped = Schema.TaggedStruct('ChildStopped', {
  at: EventTime,
  childId: ChildId,
  generation: Generation,
})
export type ChildStopped = typeof ChildStopped.Type

export const ProbeResult = Schema.TaggedStruct('ProbeResult', {
  at: EventTime,
  childId: ChildId,
  generation: Generation,
  alive: Schema.Boolean,
})
export type ProbeResult = typeof ProbeResult.Type

export const TimerElapsed = Schema.TaggedStruct('TimerElapsed', {
  at: EventTime,
  kind: TimerKind,
  target: TimerTarget,
})
export type TimerElapsed = typeof TimerElapsed.Type

export const DynamicStartRequested = Schema.TaggedStruct('DynamicStartRequested', {
  at: EventTime,
  requestId: RequestId,
})
export type DynamicStartRequested = typeof DynamicStartRequested.Type

export const DynamicStopRequested = Schema.TaggedStruct('DynamicStopRequested', {
  at: EventTime,
  requestId: RequestId,
  childId: ChildId,
  generation: Generation,
})
export type DynamicStopRequested = typeof DynamicStopRequested.Type

export const ShutdownRequested = Schema.TaggedStruct('ShutdownRequested', {
  at: EventTime,
  reason: TerminationReason,
})
export type ShutdownRequested = typeof ShutdownRequested.Type

export const SupervisionEvent = Schema.Union([
  ChildStarted,
  ChildReady,
  ChildTerminated,
  ChildStopped,
  ProbeResult,
  TimerElapsed,
  DynamicStartRequested,
  DynamicStopRequested,
  ShutdownRequested,
])
export type SupervisionEvent = typeof SupervisionEvent.Type
