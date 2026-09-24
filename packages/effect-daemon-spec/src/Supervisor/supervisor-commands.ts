import {
  Array as Arr,
  Cause,
  Clock,
  Deferred,
  Duration,
  Effect,
  Exit,
  HashMap,
  Match,
  Option,
  Ref,
  Schema,
  Scope,
} from 'effect'
import type { SupervisionEvent, TimerKind } from '../kernel/SupervisionEvent.schema.js'
import type { ChildId, Generation } from '../kernel/SupervisionLimits.schema.js'
import { ReplyStartAccepted } from '../kernel/SupervisorCommand.schema.js'
import type {
  StartChild,
  StopChild,
  SupervisorArm,
  SupervisorCommands,
  SupervisorReply,
  TerminateSupervisor,
} from '../kernel/SupervisorCommand.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import type { BoundChild } from './bound-child.js'
import type { Started } from './Medium.js'
import type { DynamicOutcome, RunningSupervisor } from './running-supervisor.handle.js'
import {
  boundChildrenOf,
  evidenceOf,
  offerEvent,
  Ops,
  ownerScopeOf,
  pendingChildrenOf,
  repliesOf,
  terminatedLatchOf,
} from './running-supervisor.handle.js'

/** The running supervisor a command executes against. */
export interface AcquiredSupervisor {
  readonly handle: RunningSupervisor
}

const stampedNow = (
  handle: RunningSupervisor,
  event: SupervisionEvent,
): Effect.Effect<void> => Effect.flatMap(Clock.currentTimeMillis, (now) => offerEvent(handle, { ...event, at: now }))

const startedEventOf = (childId: ChildId, generation: Generation): SupervisionEvent => ({
  _tag: 'ChildStarted',
  at: 0,
  childId,
  generation,
})

const readyEventOf = (childId: ChildId, generation: Generation): SupervisionEvent => ({
  _tag: 'ChildReady',
  at: 0,
  childId,
  generation,
})

const terminatedEventOf = (
  childId: ChildId,
  generation: Generation,
  reason: TerminationReason,
): SupervisionEvent => ({ _tag: 'ChildTerminated', at: 0, childId, generation, reason })

const stoppedEventOf = (childId: ChildId, generation: Generation): SupervisionEvent => ({
  _tag: 'ChildStopped',
  at: 0,
  childId,
  generation,
})

const probeEventOf = (childId: ChildId, generation: Generation, alive: boolean): SupervisionEvent => ({
  _tag: 'ProbeResult',
  at: 0,
  childId,
  generation,
  alive,
})

const timerEventOf = (
  kind: TimerKind,
  childId: ChildId,
  generation: Generation,
): SupervisionEvent => ({
  _tag: 'TimerElapsed',
  at: 0,
  kind,
  target: { _tag: 'ChildTimer', childId, generation },
})

const supervisorTimerEventOf = (kind: TimerKind): SupervisionEvent => ({
  _tag: 'TimerElapsed',
  at: 0,
  kind,
  target: { _tag: 'SupervisorTimer' },
})

const evidenceKeyOf = (childId: ChildId, generation: Generation): string => `${childId}#${generation}`

const registerStarted = (
  handle: RunningSupervisor,
  childId: ChildId,
  generation: Generation,
  evidence: Started,
): Effect.Effect<void> =>
  Ref.update(evidenceOf(handle), (known) => HashMap.set(known, evidenceKeyOf(childId, generation), evidence))

const knownStarted = (
  handle: RunningSupervisor,
  childId: ChildId,
  generation: Generation,
): Effect.Effect<Option.Option<Started>> =>
  Effect.map(Ref.get(evidenceOf(handle)), (known) => HashMap.get(known, evidenceKeyOf(childId, generation)))

const watchReadiness = (
  handle: RunningSupervisor,
  evidence: Started,
  childId: ChildId,
  generation: Generation,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(
    Effect.forkIn(
      Effect.asVoid(Effect.andThen(evidence.ready, stampedNow(handle, readyEventOf(childId, generation)))),
      ownerScopeOf(handle),
    ),
  )

const watchReport = (
  handle: RunningSupervisor,
  child: BoundChild,
  evidence: Started,
  childId: ChildId,
  generation: Generation,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(
    Effect.forkIn(
      Effect.flatMap(
        child.report(evidence),
        (reason) => stampedNow(handle, terminatedEventOf(childId, generation, reason)),
      ),
      ownerScopeOf(handle),
    ),
  )

/**
 * The child bound to an id. Declared children are bound at acquisition and dynamic
 * ones by `bindDynamicPrograms` before their start runs, so a missing binding is a
 * broken invariant and dies rather than reporting a start that never ran.
 */
const boundChildFor = (handle: RunningSupervisor, childId: ChildId): Effect.Effect<BoundChild> =>
  Effect.flatMap(
    Ref.get(boundChildrenOf(handle)),
    (children) => Effect.orDie(Effect.fromOption(HashMap.get(children, childId))),
  )

const failureReasonOf = (cause: Cause.Cause<TerminationReason>): TerminationReason =>
  Option.getOrElse(Cause.findErrorOption(cause), () => ({
    _tag: 'Abnormal',
    report: { _tag: 'CauseReport', cause: Cause.pretty(cause) },
  }))

const executeStart = (
  acquired: AcquiredSupervisor,
  command: StartChild,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const child = yield* boundChildFor(acquired.handle, command.childId)
    const outcome = yield* Effect.exit(child.start)
    yield* Exit.match(outcome, {
      onSuccess: (evidence) =>
        Effect.andThen(
          registerStarted(acquired.handle, command.childId, command.generation, evidence),
          Effect.andThen(
            stampedNow(acquired.handle, startedEventOf(command.childId, command.generation)),
            Effect.andThen(
              watchReadiness(acquired.handle, evidence, command.childId, command.generation),
              watchReport(acquired.handle, child, evidence, command.childId, command.generation),
            ),
          ),
        ),
      onFailure: (cause) =>
        stampedNow(
          acquired.handle,
          terminatedEventOf(command.childId, command.generation, failureReasonOf(cause)),
        ),
    })
  })

/**
 * Moves each answered request's pending child: an accepted start binds it to the
 * child the kernel allocated, and every answered request drops its pending entry.
 */
const bindDynamicPrograms = (
  handle: RunningSupervisor,
  replies: ReadonlyArray<SupervisorReply>,
): Effect.Effect<void> =>
  Effect.andThen(
    Effect.forEach(
      Arr.filter(replies, Schema.is(ReplyStartAccepted)),
      (accepted) =>
        Effect.flatMap(Ref.get(pendingChildrenOf(handle)), (pending) =>
          Effect.orDie(Effect.fromOption(HashMap.get(pending, accepted.requestId))).pipe(
            Effect.flatMap((child) =>
              Ref.update(boundChildrenOf(handle), (children) =>
                HashMap.set(children, accepted.childId, child))
            ),
          )),
      { discard: true },
    ),
    Ref.update(pendingChildrenOf(handle), (pending) =>
      Arr.reduce(replies, pending, (remaining, reply) =>
        HashMap.remove(remaining, reply.requestId))),
  )

const executeStop = (
  acquired: AcquiredSupervisor,
  command: StopChild,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const child = yield* boundChildFor(acquired.handle, command.childId)
    const found = yield* knownStarted(acquired.handle, command.childId, command.generation)
    yield* Option.match(found, {
      onNone: () => Effect.void,
      onSome: (evidence) => Effect.asVoid(child.stop(evidence, command.shutdown)),
    })
    yield* stampedNow(acquired.handle, stoppedEventOf(command.childId, command.generation))
  })

const armTimer = (
  acquired: AcquiredSupervisor,
  deadline: number,
  event: SupervisionEvent,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(Clock.currentTimeMillis, (now) =>
    Effect.asVoid(
      Effect.forkIn(
        Effect.andThen(Effect.sleep(Duration.millis(Math.max(0, deadline - now))), stampedNow(acquired.handle, event)),
        ownerScopeOf(acquired.handle),
      ),
    ))

const executeArm = (
  acquired: AcquiredSupervisor,
  arm: SupervisorArm,
): Effect.Effect<void, never, Scope.Scope> =>
  Match.value(arm).pipe(
    Match.tag('ArmChildTimer', (timer) =>
      armTimer(acquired, timer.deadline, timerEventOf(timer.kind, timer.childId, timer.generation))),
    Match.tag('ArmSupervisorTimer', (timer) =>
      armTimer(acquired, timer.deadline, supervisorTimerEventOf(timer.kind))),
    Match.exhaustive,
  )

const outcomeOf = (reply: SupervisorReply): DynamicOutcome =>
  Match.value(reply).pipe(
    Match.tag('ReplyStartAccepted', (accepted) => ({
      outcome: 'accepted',
      childId: accepted.childId,
      generation: accepted.generation,
    } as const)),
    Match.tag('ReplyStartRefused', () => ({ outcome: 'refused' } as const)),
    Match.tag('ReplyStopped', () => ({ outcome: 'stopped' } as const)),
    Match.exhaustive,
  )

const executeReply = (
  acquired: AcquiredSupervisor,
  reply: SupervisorReply,
): Effect.Effect<void, never, never> =>
  Ops.resolveWaiting(repliesOf(acquired.handle), reply.requestId, outcomeOf(reply))

const executeTerminate = (
  acquired: AcquiredSupervisor,
  _command: TerminateSupervisor,
): Effect.Effect<void, never, never> =>
  Effect.andThen(
    Ref.update(evidenceOf(acquired.handle), () => HashMap.empty<string, Started>()),
    Deferred.succeed(terminatedLatchOf(acquired.handle), void 0),
  )

const bucketRunnerOf = (
  acquired: AcquiredSupervisor,
): {
  readonly stops: (commands: SupervisorCommands) => Effect.Effect<void, never, Scope.Scope>
  readonly starts: (commands: SupervisorCommands) => Effect.Effect<void, never, Scope.Scope>
  readonly arms: (commands: SupervisorCommands) => Effect.Effect<void, never, Scope.Scope>
  readonly replies: (commands: SupervisorCommands) => Effect.Effect<void, never, never>
  readonly terminates: (commands: SupervisorCommands) => Effect.Effect<void, never, never>
} => ({
  stops: (commands) => Effect.forEach(commands.stops, (command) => executeStop(acquired, command), { discard: true }),
  starts: (commands) =>
    Effect.forEach(commands.starts, (command) => executeStart(acquired, command), { discard: true }),
  arms: (commands) => Effect.forEach(commands.arms, (command) => executeArm(acquired, command), { discard: true }),
  replies: (commands) => Effect.forEach(commands.replies, (reply) => executeReply(acquired, reply), { discard: true }),
  terminates: (commands) =>
    Effect.forEach(commands.terminates, (command) => executeTerminate(acquired, command), { discard: true }),
})

export const Commands = {
  runBuckets: (
    acquired: AcquiredSupervisor,
    commands: SupervisorCommands,
  ): Effect.Effect<void, never, Scope.Scope> => runBuckets(acquired, commands),
  probeOnce: (
    acquired: AcquiredSupervisor,
    childId: ChildId,
    generation: Generation,
  ): Effect.Effect<void, never, Scope.Scope> => probeOnce(acquired, childId, generation),
  answerStale: (
    acquired: AcquiredSupervisor,
    event: SupervisionEvent,
  ): Effect.Effect<void, never, never> => answerStale(acquired, event),
  requestIdOf: (event: SupervisionEvent): string | undefined => requestIdOf(event),
} as const

const runBuckets = (
  acquired: AcquiredSupervisor,
  commands: SupervisorCommands,
): Effect.Effect<void, never, Scope.Scope> => {
  const buckets = bucketRunnerOf(acquired)
  return Effect.andThen(
    buckets.stops(commands),
    Effect.andThen(
      Effect.andThen(bindDynamicPrograms(acquired.handle, commands.replies), buckets.starts(commands)),
      Effect.andThen(
        buckets.arms(commands),
        Effect.andThen(buckets.replies(commands), buckets.terminates(commands)),
      ),
    ),
  )
}

const probeOnce = (
  acquired: AcquiredSupervisor,
  childId: ChildId,
  generation: Generation,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const child = yield* boundChildFor(acquired.handle, childId)
    const found = yield* knownStarted(acquired.handle, childId, generation)
    const alive = yield* Option.match(found, {
      onNone: () => Effect.succeed(false),
      onSome: (evidence) => child.probe(evidence),
    })
    yield* stampedNow(acquired.handle, probeEventOf(childId, generation, alive))
  })

const requestIdOf = (event: SupervisionEvent): string | undefined =>
  Match.value(event).pipe(
    Match.when({ _tag: 'DynamicStartRequested' }, (requested) => requested.requestId),
    Match.when({ _tag: 'DynamicStopRequested' }, (requested) => requested.requestId),
    Match.orElse(() => undefined),
  )

const answerStale = (
  acquired: AcquiredSupervisor,
  event: SupervisionEvent,
): Effect.Effect<void, never, never> => {
  const requestId = requestIdOf(event)
  return requestId === undefined
    ? Effect.void
    : Ops.resolveWaiting(repliesOf(acquired.handle), requestId, Ops.staleOf(event))
}
