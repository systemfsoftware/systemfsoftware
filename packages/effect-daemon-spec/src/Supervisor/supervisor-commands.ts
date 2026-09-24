import { Array as Arr, Clock, Deferred, Duration, Effect, HashMap, Match, Option, Ref, Schema, Scope } from 'effect'
import type { SupervisionEvent, TimerKind } from '../kernel/SupervisionEvent.schema.js'
import type { ChildId, Generation } from '../kernel/SupervisionLimits.schema.js'
import { ReplyStartAccepted } from '../kernel/SupervisorCommand.schema.js'
import type {
  ArmChildTimer,
  ArmSupervisorTimer,
  StartChild,
  StopChild,
  SupervisorArm,
  SupervisorCommands,
  SupervisorReply,
  TerminateSupervisor,
} from '../kernel/SupervisorCommand.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import { fiberPort, type FiberProgram, medium as fiberMedium } from './FiberMedium.js'
import type { Medium, Started } from './Medium.js'
import type { DynamicOutcome, RunningSupervisor } from './running-supervisor.handle.js'
import {
  evidenceOf,
  offerEvent,
  Ops,
  ownerScopeOf,
  pendingProgramsOf,
  programsOf,
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

const mediumOf = (): Effect.Effect<Medium<FiberProgram, never, Scope.Scope>, never, never> =>
  Effect.catchCause(
    Effect.map(Effect.serviceOption(fiberPort), (found) =>
      Option.match(found, {
        onNone: () => fiberMedium,
        onSome: (port) => port.medium,
      })),
    () => Effect.succeed(fiberMedium),
  )
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
  medium: Medium<FiberProgram, never, Scope.Scope>,
  evidence: Started,
  childId: ChildId,
  generation: Generation,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(
    Effect.forkIn(
      Effect.flatMap(
        medium.report(evidence),
        (reason) => stampedNow(handle, terminatedEventOf(childId, generation, reason)),
      ),
      ownerScopeOf(handle),
    ),
  )

/**
 * The program bound to a child. Declared children are bound at acquisition and
 * dynamic ones by `bindDynamicPrograms` before their start runs, so a missing
 * binding is a broken invariant and dies rather than reporting a start that never ran.
 */
const programFor = (handle: RunningSupervisor, childId: ChildId): Effect.Effect<FiberProgram> =>
  Effect.flatMap(
    Ref.get(programsOf(handle)),
    (programs) => Effect.orDie(Effect.fromOption(HashMap.get(programs, childId))),
  )

const executeStart = (
  acquired: AcquiredSupervisor,
  medium: Medium<FiberProgram, never, Scope.Scope>,
  command: StartChild,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const program = yield* programFor(acquired.handle, command.childId)
    const childScope = yield* Scope.fork(ownerScopeOf(acquired.handle))
    const evidence: Started = yield* medium.start(program).pipe(Scope.provide(childScope))
    yield* registerStarted(acquired.handle, command.childId, command.generation, evidence)
    yield* stampedNow(acquired.handle, startedEventOf(command.childId, command.generation))
    yield* watchReadiness(acquired.handle, evidence, command.childId, command.generation)
    yield* watchReport(acquired.handle, medium, evidence, command.childId, command.generation)
  })

/**
 * Moves each answered request's pending program: an accepted start binds it to the
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
        Effect.flatMap(Ref.get(pendingProgramsOf(handle)), (pending) =>
          Effect.orDie(Effect.fromOption(HashMap.get(pending, accepted.requestId))).pipe(
            Effect.flatMap((program) =>
              Ref.update(programsOf(handle), (programs) =>
                HashMap.set(programs, accepted.childId, program))
            ),
          )),
      { discard: true },
    ),
    Ref.update(pendingProgramsOf(handle), (pending) =>
      Arr.reduce(replies, pending, (remaining, reply) =>
        HashMap.remove(remaining, reply.requestId))),
  )

const executeStop = (
  acquired: AcquiredSupervisor,
  medium: Medium<FiberProgram, never, Scope.Scope>,
  command: StopChild,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(knownStarted(acquired.handle, command.childId, command.generation), (found) =>
    Effect.andThen(
      Option.match(found, {
        onNone: () => Effect.void,
        onSome: (evidence) => Effect.asVoid(medium.stop(evidence, command.shutdown)),
      }),
      stampedNow(acquired.handle, stoppedEventOf(command.childId, command.generation)),
    ))

const executeChildArm = (
  acquired: AcquiredSupervisor,
  command: ArmChildTimer,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(Clock.currentTimeMillis, (now) =>
    Effect.asVoid(
      Effect.forkIn(
        Effect.andThen(
          Effect.sleep(Duration.millis(Math.max(0, command.deadline - now))),
          stampedNow(acquired.handle, timerEventOf(command.kind, command.childId, command.generation)),
        ),
        ownerScopeOf(acquired.handle),
      ),
    ))

const executeSupervisorArm = (
  acquired: AcquiredSupervisor,
  command: ArmSupervisorTimer,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(Clock.currentTimeMillis, (now) =>
    Effect.asVoid(
      Effect.forkIn(
        Effect.andThen(
          Effect.sleep(Duration.millis(Math.max(0, command.deadline - now))),
          stampedNow(acquired.handle, supervisorTimerEventOf(command.kind)),
        ),
        ownerScopeOf(acquired.handle),
      ),
    ))

const executeArm = (
  acquired: AcquiredSupervisor,
  arm: SupervisorArm,
): Effect.Effect<void, never, Scope.Scope> =>
  Match.value(arm).pipe(
    Match.tag('ArmChildTimer', (timer) => executeChildArm(acquired, timer)),
    Match.tag('ArmSupervisorTimer', (timer) => executeSupervisorArm(acquired, timer)),
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
  Effect.flatMap(Ref.get(repliesOf(acquired.handle)), (pending) =>
    Option.match(HashMap.get(pending, reply.requestId), {
      onNone: () => Effect.void,
      onSome: (waiter) =>
        Effect.andThen(
          Ref.set(repliesOf(acquired.handle), HashMap.remove(pending, reply.requestId)),
          Deferred.succeed(waiter, outcomeOf(reply)),
        ),
    }))

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
  medium: Medium<FiberProgram, never, Scope.Scope>,
): {
  readonly stops: (commands: SupervisorCommands) => Effect.Effect<void, never, Scope.Scope>
  readonly starts: (commands: SupervisorCommands) => Effect.Effect<void, never, Scope.Scope>
  readonly arms: (commands: SupervisorCommands) => Effect.Effect<void, never, Scope.Scope>
  readonly replies: (commands: SupervisorCommands) => Effect.Effect<void, never, never>
  readonly terminates: (commands: SupervisorCommands) => Effect.Effect<void, never, never>
} => ({
  stops: (commands) =>
    Effect.forEach(commands.stops, (command) => executeStop(acquired, medium, command), { discard: true }),
  starts: (commands) =>
    Effect.forEach(commands.starts, (command) => executeStart(acquired, medium, command), { discard: true }),
  arms: (commands) => Effect.forEach(commands.arms, (command) => executeArm(acquired, command), { discard: true }),
  replies: (commands) => Effect.forEach(commands.replies, (reply) => executeReply(acquired, reply), { discard: true }),
  terminates: (commands) =>
    Effect.forEach(commands.terminates, (command) => executeTerminate(acquired, command), { discard: true }),
})

export const Commands = {
  runBuckets: (
    acquired: AcquiredSupervisor,
    medium: Medium<FiberProgram, never, Scope.Scope>,
    commands: SupervisorCommands,
  ): Effect.Effect<void, never, Scope.Scope> => runBuckets(acquired, medium, commands),
  probeOnce: (
    acquired: AcquiredSupervisor,
    medium: Medium<FiberProgram, never, Scope.Scope>,
    childId: ChildId,
    generation: Generation,
  ): Effect.Effect<void, never, Scope.Scope> => probeOnce(acquired, medium, childId, generation),
  mediumOf: (): Effect.Effect<Medium<FiberProgram, never, Scope.Scope>, never, never> => mediumOf(),
  answerStale: (
    acquired: AcquiredSupervisor,
    event: SupervisionEvent,
  ): Effect.Effect<void, never, never> => answerStale(acquired, event),
  requestIdOf: (event: SupervisionEvent): string | undefined => requestIdOf(event),
} as const

const runBuckets = (
  acquired: AcquiredSupervisor,
  medium: Medium<FiberProgram, never, Scope.Scope>,
  commands: SupervisorCommands,
): Effect.Effect<void, never, Scope.Scope> => {
  const buckets = bucketRunnerOf(acquired, medium)
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
  medium: Medium<FiberProgram, never, Scope.Scope>,
  childId: ChildId,
  generation: Generation,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(knownStarted(acquired.handle, childId, generation), (found) =>
    Effect.flatMap(
      Option.match(found, {
        onNone: () => Effect.succeed(false),
        onSome: (evidence) => medium.probe(evidence),
      }),
      (alive) => stampedNow(acquired.handle, probeEventOf(childId, generation, alive)),
    ))

const requestIdOf = (event: SupervisionEvent): string | undefined =>
  Match.value(event).pipe(
    Match.when({ _tag: 'DynamicStartRequested' }, (requested) => requested.requestId),
    Match.when({ _tag: 'DynamicStopRequested' }, (requested) => requested.requestId),
    Match.orElse(() => undefined),
  )

const staleOutcomeOf = (event: SupervisionEvent): DynamicOutcome =>
  Match.value(event).pipe(
    Match.when({ _tag: 'DynamicStartRequested' }, () => ({ outcome: 'refused' } as const)),
    Match.orElse(() => ({ outcome: 'missed' } as const)),
  )

const answerStale = (
  acquired: AcquiredSupervisor,
  event: SupervisionEvent,
): Effect.Effect<void, never, never> => {
  const requestId = requestIdOf(event)
  return requestId === undefined
    ? Effect.void
    : Effect.flatMap(
      Ref.get(repliesOf(acquired.handle)),
      (pending) => Ops.resolveWaiting(repliesOf(acquired.handle), pending, requestId, staleOutcomeOf(event)),
    )
}
