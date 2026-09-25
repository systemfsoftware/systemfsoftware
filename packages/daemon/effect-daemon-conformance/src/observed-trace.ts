import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Match } from 'effect'
import type {
  ChildRef,
  CommandKind,
  DecisionKind,
  EventKind,
  ObservedCommand,
  ObservedDecision,
  ObservedEvent,
  ObservedStep,
  ReasonKind,
} from './Trace.schema.js'

type TraceEntry = Supervisor.TraceEntry
type Event = TraceEntry['event']
type Decision = TraceEntry['decision']
type WithField<U, K extends PropertyKey> = U extends U ? (K extends keyof U ? U : never) : never
type FieldOf<U, K extends PropertyKey> = WithField<U, K> extends infer M ? (M extends Record<K, infer V> ? V : never)
  : never
type Termination = FieldOf<Event, 'reason'>
type Failure = FieldOf<Termination, 'report'>
type TimerTarget = FieldOf<Event, 'target'>
type Commands = FieldOf<Decision, 'commands'>
type Command =
  | Commands['stops'][number]
  | Commands['starts'][number]
  | Commands['arms'][number]
  | Commands['replies'][number]
  | Commands['terminates'][number]

const childRef = (childId: string, generation: number): ChildRef => ({ childId, generation })

const observedEvent = (kind: EventKind, child: ChildRef | null, reason: ReasonKind | null): ObservedEvent => ({
  kind,
  child,
  reason,
})

const observedCommand = (kind: CommandKind, child: ChildRef | null): ObservedCommand => ({ kind, child })

const observedDecision = (kind: DecisionKind, commands: ReadonlyArray<ObservedCommand>): ObservedDecision => ({
  kind,
  commands,
})

const failureKindOf = (report: Failure): ReasonKind =>
  Match.value(report).pipe(
    Match.tag('CauseReport', (): ReasonKind => 'CauseReport'),
    Match.tag('ExitReport', (): ReasonKind => 'ExitReport'),
    Match.tag('InferredReport', (): ReasonKind => 'InferredReport'),
    Match.tag('DeadlineMissed', (): ReasonKind => 'DeadlineMissed'),
    Match.exhaustive,
  )

const reasonKindOf = (reason: Termination): ReasonKind =>
  Match.value(reason).pipe(
    Match.tag('Normal', (): ReasonKind => 'Normal'),
    Match.tag('Shutdown', (): ReasonKind => 'Shutdown'),
    Match.tag('Abnormal', (abnormal) => failureKindOf(abnormal.report)),
    Match.exhaustive,
  )

const timerChildOf = (target: TimerTarget): ChildRef | null =>
  Match.value(target).pipe(
    Match.tag('ChildTimer', (timer) => childRef(timer.childId, timer.generation)),
    Match.tag('SupervisorTimer', () => null),
    Match.exhaustive,
  )

const eventOf = (event: Event): ObservedEvent =>
  Match.value(event).pipe(
    Match.tag('SupervisorStarted', () => observedEvent('SupervisorStarted', null, null)),
    Match.tag('ChildStarted', (started) =>
      observedEvent('ChildStarted', childRef(started.childId, started.generation), null)),
    Match.tag('ChildReady', (ready) =>
      observedEvent('ChildReady', childRef(ready.childId, ready.generation), null)),
    Match.tag(
      'ChildTerminated',
      (terminated) =>
        observedEvent(
          'ChildTerminated',
          childRef(terminated.childId, terminated.generation),
          reasonKindOf(terminated.reason),
        ),
    ),
    Match.tag('ChildStopped', (stopped) =>
      observedEvent('ChildStopped', childRef(stopped.childId, stopped.generation), null)),
    Match.tag('ProbeResult', (probe) =>
      observedEvent('ProbeResult', childRef(probe.childId, probe.generation), null)),
    Match.tag('TimerElapsed', (timer) =>
      observedEvent('TimerElapsed', timerChildOf(timer.target), null)),
    Match.tag('DynamicStartRequested', () => observedEvent('DynamicStartRequested', null, null)),
    Match.tag(
      'DynamicStopRequested',
      (stopping) => observedEvent('DynamicStopRequested', childRef(stopping.childId, stopping.generation), null),
    ),
    Match.tag(
      'ShutdownRequested',
      (shutdown) => observedEvent('ShutdownRequested', null, reasonKindOf(shutdown.reason)),
    ),
    Match.exhaustive,
  )

const commandOf = (command: Command): ObservedCommand =>
  Match.value(command).pipe(
    Match.tag('StartChild', (start) => observedCommand('StartChild', childRef(start.childId, start.generation))),
    Match.tag('StopChild', (stop) => observedCommand('StopChild', childRef(stop.childId, stop.generation))),
    Match.tag('ArmChildTimer', (arm) => observedCommand('ArmChildTimer', childRef(arm.childId, arm.generation))),
    Match.tag('ArmSupervisorTimer', () => observedCommand('ArmSupervisorTimer', null)),
    Match.tag(
      'ReplyStartAccepted',
      (reply) => observedCommand('ReplyStartAccepted', childRef(reply.childId, reply.generation)),
    ),
    Match.tag('ReplyStartRefused', () => observedCommand('ReplyStartRefused', null)),
    Match.tag('ReplyStopped', () => observedCommand('ReplyStopped', null)),
    Match.tag('TerminateSupervisor', () => observedCommand('TerminateSupervisor', null)),
    Match.exhaustive,
  )

const commandsOf = (commands: Commands): ReadonlyArray<ObservedCommand> =>
  Arr.flatMap(
    [commands.stops, commands.starts, commands.arms, commands.replies, commands.terminates],
    (bucket) => Arr.map(bucket, commandOf),
  )

const decisionOf = (decision: Decision): ObservedDecision =>
  Match.value(decision).pipe(
    Match.tag('Stale', () => observedDecision('Stale', [])),
    Match.tag('Continue', (current) => observedDecision('Continue', commandsOf(current.commands))),
    Match.tag('RestartChildren', (restart) => observedDecision('RestartChildren', commandsOf(restart.commands))),
    Match.tag('StartChildren', (start) => observedDecision('StartChildren', commandsOf(start.commands))),
    Match.tag('CoolDown', (cool) => observedDecision('CoolDown', commandsOf(cool.commands))),
    Match.tag('StopChildren', (stop) => observedDecision('StopChildren', commandsOf(stop.commands))),
    Match.tag('Terminate', (terminate) => observedDecision('Terminate', commandsOf(terminate.commands))),
    Match.tag('RefuseDynamicStart', (refused) => observedDecision('RefuseDynamicStart', commandsOf(refused.commands))),
    Match.exhaustive,
  )

const stepOf = (entry: TraceEntry): ObservedStep => ({
  event: eventOf(entry.event),
  decision: decisionOf(entry.decision),
})

/** Reduces a supervisor's kernel trace to the steps a pairwise comparison reads. */
export const observedStepsOf = (entries: ReadonlyArray<TraceEntry>): ReadonlyArray<ObservedStep> =>
  Arr.map(entries, stepOf)
