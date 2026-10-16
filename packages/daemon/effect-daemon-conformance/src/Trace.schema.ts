import { Schema } from 'effect'

export const ChildId = Schema.String
export type ChildId = typeof ChildId.Type

/** Incarnation counter, bounded so a generated trace stays small. */
export const Generation = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 64 })))
export type Generation = typeof Generation.Type

/**
 * A termination reason flattened to the tags a trace compares. The three
 * medium-supplied failure tags are what a `MediumDeclaration`'s reporting level
 * chooses between; `Normal`, `Shutdown` and `DeadlineMissed` are the kernel's
 * own and survive projection at every level.
 */
export const ReasonKind = Schema.Literals([
  'Normal',
  'Shutdown',
  'CauseReport',
  'ExitReport',
  'InferredReport',
  'DeadlineMissed',
])
export type ReasonKind = typeof ReasonKind.Type

export const EventKind = Schema.Literals([
  'SupervisorStarted',
  'ChildStarted',
  'ChildReady',
  'ChildTerminated',
  'ChildStopped',
  'ProbeResult',
  'TimerElapsed',
  'DynamicStartRequested',
  'DynamicStopRequested',
  'ShutdownRequested',
])
export type EventKind = typeof EventKind.Type

export const CommandKind = Schema.Literals([
  'StartChild',
  'StopChild',
  'ArmChildTimer',
  'ArmSupervisorTimer',
  'ReplyStartAccepted',
  'ReplyStartRefused',
  'ReplyStopped',
  'TerminateSupervisor',
])
export type CommandKind = typeof CommandKind.Type

export const DecisionKind = Schema.Literals([
  'Stale',
  'Continue',
  'RestartChildren',
  'StartChildren',
  'CoolDown',
  'StopChildren',
  'Terminate',
  'RefuseDynamicStart',
])
export type DecisionKind = typeof DecisionKind.Type

export const ChildRef = Schema.Struct({ childId: ChildId, generation: Generation })
export type ChildRef = typeof ChildRef.Type

export const ObservedEvent = Schema.Struct({
  kind: EventKind,
  child: Schema.NullOr(ChildRef),
  reason: Schema.NullOr(ReasonKind),
})
export type ObservedEvent = typeof ObservedEvent.Type

export const ObservedCommand = Schema.Struct({ kind: CommandKind, child: Schema.NullOr(ChildRef) })
export type ObservedCommand = typeof ObservedCommand.Type

export const ObservedDecision = Schema.Struct({
  kind: DecisionKind,
  commands: Schema.Array(ObservedCommand),
})
export type ObservedDecision = typeof ObservedDecision.Type

/**
 * One kernel step reduced to what a pairwise comparison reads: event kind,
 * child identity and reason tag; decision kind and the ordered commands it
 * carries. Everything a medium cannot be held to — cause text, exit codes,
 * timestamps — is absent by construction.
 */
export const ObservedStep = Schema.Struct({ event: ObservedEvent, decision: ObservedDecision })
export type ObservedStep = typeof ObservedStep.Type

export const ConformanceTrace = Schema.Struct({
  scenario: Schema.String,
  medium: Schema.String,
  steps: Schema.Array(ObservedStep),
})
export type ConformanceTrace = typeof ConformanceTrace.Type
