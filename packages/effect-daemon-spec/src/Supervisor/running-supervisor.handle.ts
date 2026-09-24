import { Handle } from '@systemfsoftware/effect-cell-types'
import { Clock, Context, Deferred, Effect, HashMap, Match, Option, PubSub, Queue, Ref, Scope } from 'effect'
import { dual } from 'effect/Function'
import * as Stream from 'effect/Stream'
import type { SupervisionDecision, SupervisorState } from '../kernel/interpret-supervision-event.workflow.js'
import type { SupervisionEvent } from '../kernel/SupervisionEvent.schema.js'
import type { ChildId, Generation } from '../kernel/SupervisionLimits.schema.js'
import { Binder, type BoundChild } from './bound-child.js'
import type { FiberProgram } from './FiberMedium.js'
import type { Medium, Started } from './Medium.js'

/** Brands a running supervisor handle. */
export const TypeId = Symbol.for('@systemfsoftware/effect-daemon-spec/RunningSupervisor')
/** The running supervisor brand. */
export type TypeId = typeof TypeId

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

interface SupervisorSlot {
  readonly state: Ref.Ref<SupervisorState>
  readonly mailbox: Queue.Queue<SupervisionEvent>
  readonly trace: PubSub.PubSub<TraceEntry>
  readonly evidence: Ref.Ref<HashMap.HashMap<string, Started>>
  readonly replies: Ref.Ref<HashMap.HashMap<string, Deferred.Deferred<DynamicOutcome>>>
  readonly boundChildren: Ref.Ref<HashMap.HashMap<ChildId, BoundChild>>
  readonly pending: Ref.Ref<HashMap.HashMap<string, BoundChild>>
  readonly requests: Ref.Ref<number>
  readonly terminated: Deferred.Deferred<void>
  readonly scope: Scope.Scope
  readonly context: Context.Context<Scope.Scope>
  readonly fiber: Medium<FiberProgram, never, Scope.Scope>
}

const RunningSupervisorDef = Handle.make<{ readonly name: string }, SupervisorSlot>()(TypeId)

/**
 * A running supervisor. Its state lives in the handle's slot, never in a module
 * registry; the only public operations are the functions exported beside it.
 */
export type RunningSupervisor = Handle.Of<typeof RunningSupervisorDef>

/** Whether a value is a running supervisor handle. */
export const isRunningSupervisor = RunningSupervisorDef.is

export const RunningSupervisorHandle = {
  make: (
    name: string,
    initial: SupervisorState,
    children: HashMap.HashMap<ChildId, BoundChild>,
    context: Context.Context<Scope.Scope>,
    fiber: Medium<FiberProgram, never, Scope.Scope>,
  ): Effect.Effect<RunningSupervisor, never, Scope.Scope> =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const slot: SupervisorSlot = {
        state: yield* Ref.make(initial),
        mailbox: yield* Queue.unbounded<SupervisionEvent>(),
        trace: yield* PubSub.unbounded<TraceEntry>(),
        evidence: yield* Ref.make(HashMap.empty<string, Started>()),
        replies: yield* Ref.make(HashMap.empty<string, Deferred.Deferred<DynamicOutcome>>()),
        boundChildren: yield* Ref.make(children),
        pending: yield* Ref.make(HashMap.empty<string, BoundChild>()),
        requests: yield* Ref.make(0),
        terminated: yield* Deferred.make<void>(),
        scope,
        context,
        fiber,
      }
      return RunningSupervisorDef.make({ name }, slot)
    }),
} as const

export const stateOf = (self: RunningSupervisor): Ref.Ref<SupervisorState> => RunningSupervisorDef.slot(self).state

export const mailboxOf = (self: RunningSupervisor): Queue.Queue<SupervisionEvent> =>
  RunningSupervisorDef.slot(self).mailbox

export const tracePubSubOf = (self: RunningSupervisor): PubSub.PubSub<TraceEntry> =>
  RunningSupervisorDef.slot(self).trace

export const evidenceOf = (self: RunningSupervisor): Ref.Ref<HashMap.HashMap<string, Started>> =>
  RunningSupervisorDef.slot(self).evidence

export const repliesOf = (
  self: RunningSupervisor,
): Ref.Ref<HashMap.HashMap<string, Deferred.Deferred<DynamicOutcome>>> => RunningSupervisorDef.slot(self).replies

export const boundChildrenOf = (
  self: RunningSupervisor,
): Ref.Ref<HashMap.HashMap<ChildId, BoundChild>> => RunningSupervisorDef.slot(self).boundChildren

export const pendingChildrenOf = (self: RunningSupervisor): Ref.Ref<HashMap.HashMap<string, BoundChild>> =>
  RunningSupervisorDef.slot(self).pending

export const fiberContextOf = (self: RunningSupervisor): Context.Context<Scope.Scope> =>
  RunningSupervisorDef.slot(self).context

export const fiberMediumOf = (self: RunningSupervisor): Medium<FiberProgram, never, Scope.Scope> =>
  RunningSupervisorDef.slot(self).fiber

/** The fiber medium bound to `program`, ready to be stored as a dynamic child. */
const boundFiberProgramOf = (self: RunningSupervisor, program: FiberProgram): BoundChild =>
  Binder.bind(program, fiberMediumOf(self), fiberContextOf(self))

export const terminatedLatchOf = (self: RunningSupervisor): Deferred.Deferred<void> =>
  RunningSupervisorDef.slot(self).terminated

export const ownerScopeOf = (self: RunningSupervisor): Scope.Scope => RunningSupervisorDef.slot(self).scope

/**
 * The kernel trace: every step's decoded event and decision, in mailbox order,
 * from the moment the stream is subscribed.
 */
export const traceOf = (self: RunningSupervisor): Stream.Stream<TraceEntry> =>
  Stream.fromPubSub(RunningSupervisorDef.slot(self).trace)

/** The supervisor's current phase and children, as the kernel last folded them. */
export const statusOf = (self: RunningSupervisor): Effect.Effect<SupervisorState> =>
  Ref.get(RunningSupervisorDef.slot(self).state)

export const offerEvent: {
  (event: SupervisionEvent): (self: RunningSupervisor) => Effect.Effect<void>
  (self: RunningSupervisor, event: SupervisionEvent): Effect.Effect<void>
} = dual(
  2,
  (self: RunningSupervisor, event: SupervisionEvent): Effect.Effect<void> =>
    Effect.asVoid(Queue.offer(RunningSupervisorDef.slot(self).mailbox, event)),
)

const shutdownEventOf = (now: number): SupervisionEvent => ({
  _tag: 'ShutdownRequested',
  at: now,
  reason: { _tag: 'Shutdown' },
})

/** Completes once the supervisor has terminated. */
export const awaitTerminated = (self: RunningSupervisor): Effect.Effect<void> =>
  Deferred.await(RunningSupervisorDef.slot(self).terminated)

/**
 * Asks the supervisor to shut down and waits until it has terminated: children stop
 * in reverse start order through their media before this completes.
 */
export const shutdown = (self: RunningSupervisor): Effect.Effect<void> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      Effect.andThen(
        Queue.offer(RunningSupervisorDef.slot(self).mailbox, shutdownEventOf(now)),
        restore(Deferred.await(RunningSupervisorDef.slot(self).terminated)),
      ))
  )

const nextRequestId = (self: RunningSupervisor, kind: string): Effect.Effect<string> =>
  Effect.map(
    Ref.getAndUpdate(RunningSupervisorDef.slot(self).requests, (count) => count + 1),
    (count) => `${kind}-${count}`,
  )

const awaitReply = (
  self: RunningSupervisor,
  requestId: string,
  eventOf: (now: number) => SupervisionEvent,
): Effect.Effect<DynamicOutcome> =>
  Effect.flatMap(Deferred.make<DynamicOutcome>(), (waiter) =>
    Effect.andThen(
      Ref.update(RunningSupervisorDef.slot(self).replies, (known) => HashMap.set(known, requestId, waiter)),
      Effect.flatMap(Clock.currentTimeMillis, (now) => {
        const event = eventOf(now)
        return Effect.andThen(
          Queue.offer(RunningSupervisorDef.slot(self).mailbox, event),
          Effect.raceFirst(
            Deferred.await(waiter),
            Effect.andThen(
              awaitTerminated(self),
              resolveWaiting(RunningSupervisorDef.slot(self).replies, requestId, staleOf(event)),
            ).pipe(
              Effect.andThen(Deferred.await(waiter)),
            ),
          ),
        )
      }),
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
        Ref.update(
          RunningSupervisorDef.slot(self).pending,
          (pending) => HashMap.set(pending, requestId, boundFiberProgramOf(self, program)),
        ),
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
  requestId: string,
  outcome: DynamicOutcome,
): Effect.Effect<void> =>
  Effect.flatMap(
    Ref.modify(replies, (pending) => [HashMap.get(pending, requestId), HashMap.remove(pending, requestId)] as const),
    Option.match({
      onNone: () => Effect.void,
      onSome: (waiter: Deferred.Deferred<DynamicOutcome>) => Effect.asVoid(Deferred.succeed(waiter, outcome)),
    }),
  )

const staleOf = (event: SupervisionEvent): DynamicOutcome =>
  Match.value(event).pipe(
    Match.when({ _tag: 'DynamicStartRequested' }, (): DynamicOutcome => ({ outcome: 'refused' })),
    Match.orElse((): DynamicOutcome => ({ outcome: 'missed' })),
  )

export const Ops = {
  resolveWaiting,
  staleOf,
} as const
