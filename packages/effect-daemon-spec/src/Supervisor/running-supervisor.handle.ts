import { Clock, Deferred, Effect, HashMap, Match, Option, Predicate, PubSub, Queue, Ref, Scope } from 'effect'
import { dual } from 'effect/Function'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import * as Stream from 'effect/Stream'
import type { SupervisionDecision, SupervisorState } from '../kernel/interpret-supervision-event.workflow.js'
import type { SupervisionEvent } from '../kernel/SupervisionEvent.schema.js'
import type { ChildId, Generation } from '../kernel/SupervisionLimits.schema.js'
import type { FiberProgram } from './FiberMedium.js'
import type { Started } from './Medium.js'

/** Brands a running supervisor handle. */
export const TypeId = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor')
/** The running supervisor brand. */
export type TypeId = typeof TypeId

const StateId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/state')
const MailboxId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/mailbox')
const TraceId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/trace')
const EvidenceId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/evidence')
const RepliesId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/replies')
const ProgramsId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/programs')
const PendingId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/pending')
const RequestsId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/requests')
const TerminatedId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/terminated')
const ScopeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor/scope')

/** One kernel step as observed: the decoded event and the decision it produced. */
export interface TraceEntry {
  readonly event: SupervisionEvent
  readonly decision: typeof SupervisionDecision.Encoded
}

/** A dynamic start the supervisor accepted, naming the child it allocated. */
export interface DynamicStartAccepted {
  readonly outcome: 'accepted'
  readonly childId: ChildId
  readonly generation: Generation
}

/** A dynamic start the supervisor refused (ceiling reached, or not running). */
export interface DynamicStartRefused {
  readonly outcome: 'refused'
}

/** The answer to a dynamic start. */
export type DynamicStartOutcome = DynamicStartAccepted | DynamicStartRefused

/** A dynamic stop that removed the child. */
export interface DynamicStopDone {
  readonly outcome: 'stopped'
}

/** A dynamic stop that named no current incarnation. */
export interface DynamicStopMissed {
  readonly outcome: 'missed'
}

/** The answer to a dynamic stop. */
export type DynamicStopOutcome = DynamicStopDone | DynamicStopMissed

/** Any dynamic answer, as the reply table stores it. */
export type DynamicOutcome = DynamicStartOutcome | DynamicStopOutcome

/**
 * A running supervisor. Its state lives in the handle's slots, never in a module
 * registry; the only public operations are the functions exported beside it.
 */
export interface RunningSupervisor extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [StateId]: Ref.Ref<SupervisorState>
  readonly [MailboxId]: Queue.Queue<SupervisionEvent>
  readonly [TraceId]: PubSub.PubSub<TraceEntry>
  readonly [EvidenceId]: Ref.Ref<HashMap.HashMap<string, Started>>
  readonly [RepliesId]: Ref.Ref<HashMap.HashMap<string, Deferred.Deferred<DynamicOutcome>>>
  readonly [ProgramsId]: Ref.Ref<HashMap.HashMap<ChildId, FiberProgram>>
  readonly [PendingId]: Ref.Ref<HashMap.HashMap<string, FiberProgram>>
  readonly [RequestsId]: Ref.Ref<number>
  readonly [TerminatedId]: Deferred.Deferred<void>
  readonly [ScopeId]: Scope.Scope
  readonly name: string
}

/** Whether a value is a running supervisor handle. */
export const isRunningSupervisor = (value: unknown): value is RunningSupervisor => Predicate.hasProperty(value, TypeId)

export const Handle = {
  make: (
    name: string,
    initial: SupervisorState,
    programs: ReadonlyMap<ChildId, FiberProgram>,
  ): Effect.Effect<RunningSupervisor, never, Scope.Scope> =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      return {
        [TypeId]: TypeId,
        [StateId]: yield* Ref.make(initial),
        [MailboxId]: yield* Queue.unbounded<SupervisionEvent>(),
        [TraceId]: yield* PubSub.unbounded<TraceEntry>(),
        [EvidenceId]: yield* Ref.make(HashMap.empty<string, Started>()),
        [RepliesId]: yield* Ref.make(HashMap.empty<string, Deferred.Deferred<DynamicOutcome>>()),
        [ProgramsId]: yield* Ref.make(HashMap.fromIterable(programs)),
        [PendingId]: yield* Ref.make(HashMap.empty<string, FiberProgram>()),
        [RequestsId]: yield* Ref.make(0),
        [TerminatedId]: yield* Deferred.make<void>(),
        [ScopeId]: scope,
        name,
        ...Prototype,
      }
    }),
} as const

export const stateOf = (self: RunningSupervisor): Ref.Ref<SupervisorState> => self[StateId]

export const mailboxOf = (self: RunningSupervisor): Queue.Queue<SupervisionEvent> => self[MailboxId]

export const tracePubSubOf = (self: RunningSupervisor): PubSub.PubSub<TraceEntry> => self[TraceId]

export const evidenceOf = (self: RunningSupervisor): Ref.Ref<HashMap.HashMap<string, Started>> => self[EvidenceId]

export const repliesOf = (
  self: RunningSupervisor,
): Ref.Ref<HashMap.HashMap<string, Deferred.Deferred<DynamicOutcome>>> => self[RepliesId]

export const programsOf = (self: RunningSupervisor): Ref.Ref<HashMap.HashMap<ChildId, FiberProgram>> => self[ProgramsId]

export const pendingProgramsOf = (self: RunningSupervisor): Ref.Ref<HashMap.HashMap<string, FiberProgram>> =>
  self[PendingId]

export const terminatedLatchOf = (self: RunningSupervisor): Deferred.Deferred<void> => self[TerminatedId]

export const ownerScopeOf = (self: RunningSupervisor): Scope.Scope => self[ScopeId]

/**
 * The kernel trace: every step's decoded event and decision, in mailbox order,
 * from the moment the stream is subscribed.
 */
export const traceOf = (self: RunningSupervisor): Stream.Stream<TraceEntry> => Stream.fromPubSub(self[TraceId])

/** The supervisor's current phase and children, as the kernel last folded them. */
export const statusOf = (self: RunningSupervisor): Effect.Effect<SupervisorState> => Ref.get(self[StateId])

export const offerEvent: {
  (event: SupervisionEvent): (self: RunningSupervisor) => Effect.Effect<void>
  (self: RunningSupervisor, event: SupervisionEvent): Effect.Effect<void>
} = dual(
  2,
  (self: RunningSupervisor, event: SupervisionEvent): Effect.Effect<void> =>
    Effect.asVoid(Queue.offer(self[MailboxId], event)),
)

const shutdownEventOf = (now: number): SupervisionEvent => ({
  _tag: 'ShutdownRequested',
  at: now,
  reason: { _tag: 'Shutdown' },
})

/** Completes once the supervisor has terminated. */
export const awaitTerminated = (self: RunningSupervisor): Effect.Effect<void> => Deferred.await(self[TerminatedId])

/**
 * Asks the supervisor to shut down and waits until it has terminated: children stop
 * in reverse start order through their media before this completes.
 */
export const shutdown = (self: RunningSupervisor): Effect.Effect<void> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      Effect.andThen(
        Queue.offer(self[MailboxId], shutdownEventOf(now)),
        restore(Deferred.await(self[TerminatedId])),
      ))
  )

const nextRequestId = (self: RunningSupervisor, kind: string): Effect.Effect<string> =>
  Effect.map(Ref.getAndUpdate(self[RequestsId], (count) => count + 1), (count) => `${kind}-${count}`)

const awaitReply = (
  self: RunningSupervisor,
  requestId: string,
  eventOf: (now: number) => SupervisionEvent,
): Effect.Effect<DynamicOutcome> =>
  Effect.flatMap(Deferred.make<DynamicOutcome>(), (waiter) =>
    Effect.andThen(
      Ref.update(self[RepliesId], (known) => HashMap.set(known, requestId, waiter)),
      Effect.andThen(
        Effect.flatMap(Clock.currentTimeMillis, (now) => Queue.offer(self[MailboxId], eventOf(now))),
        Deferred.await(waiter),
      ),
    ))

/**
 * Starts a dynamic child running `program`. The supervisor allocates its id and
 * answers `accepted` with that id, or `refused` at the declared ceiling.
 */
export const startChild: {
  (program: FiberProgram): (self: RunningSupervisor) => Effect.Effect<DynamicOutcome>
  (self: RunningSupervisor, program: FiberProgram): Effect.Effect<DynamicOutcome>
} = dual(
  2,
  (self: RunningSupervisor, program: FiberProgram): Effect.Effect<DynamicOutcome> =>
    Effect.flatMap(nextRequestId(self, 'start'), (requestId) =>
      Effect.andThen(
        Ref.update(self[PendingId], (pending) => HashMap.set(pending, requestId, program)),
        awaitReply(self, requestId, (now) => ({ _tag: 'DynamicStartRequested', at: now, requestId })),
      )),
)

/**
 * Stops the dynamic child's named incarnation and removes it. Answers `stopped`, or
 * `missed` when that incarnation is no longer current.
 */
export const stopChild: {
  (childId: ChildId, generation: Generation): (self: RunningSupervisor) => Effect.Effect<DynamicOutcome>
  (self: RunningSupervisor, childId: ChildId, generation: Generation): Effect.Effect<DynamicOutcome>
} = dual(
  3,
  (self: RunningSupervisor, childId: ChildId, generation: Generation): Effect.Effect<DynamicOutcome> =>
    Effect.flatMap(nextRequestId(self, 'stop'), (requestId) =>
      awaitReply(
        self,
        requestId,
        (now) => ({ _tag: 'DynamicStopRequested', at: now, requestId, childId, generation }),
      )),
)

const resolveWaiting = (
  replies: Ref.Ref<HashMap.HashMap<string, Deferred.Deferred<DynamicOutcome>>>,
  pending: HashMap.HashMap<string, Deferred.Deferred<DynamicOutcome>>,
  requestId: string,
  outcome: DynamicOutcome,
): Effect.Effect<void> =>
  Option.match(HashMap.get(pending, requestId), {
    onNone: () => Effect.void,
    onSome: (waiter: Deferred.Deferred<DynamicOutcome>) =>
      Effect.andThen(
        Ref.set(replies, HashMap.remove(pending, requestId)),
        Deferred.succeed(waiter, outcome),
      ),
  })

const staleOf = (event: SupervisionEvent): DynamicOutcome =>
  Match.value(event).pipe(
    Match.when({ _tag: 'DynamicStartRequested' }, (): DynamicOutcome => ({ outcome: 'refused' })),
    Match.orElse((): DynamicOutcome => ({ outcome: 'missed' })),
  )

export const Ops = {
  resolveWaiting,
  staleOf,
} as const
