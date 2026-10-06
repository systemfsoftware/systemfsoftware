import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  ClockRow,
  DeferredRow,
  ExecutionEvent,
  ExecutionState,
  type Interruption,
  JournalWrite,
  Mailbox,
} from './journal.schema.js'

const AdmitEventTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-workflow-durable-object/AdmitEvent')

/** The event changes nothing the execution can observe: write nothing, queue nothing. */
export class Ignored extends Schema.TaggedClass<Ignored>()('Ignored', {}) {
  readonly [AdmitEventTypeId] = AdmitEventTypeId
}

/** Write to the journal without queueing a replay: one is already pending, or none is needed. */
export class Recorded extends Schema.TaggedClass<Recorded>()('Recorded', {
  writes: Schema.NonEmptyArray(JournalWrite),
}) {
  readonly [AdmitEventTypeId] = AdmitEventTypeId
}

/** Write to the journal and queue the event, so the run loop replays the execution for it. */
export class Enqueued extends Schema.TaggedClass<Enqueued>()('Enqueued', {
  writes: Schema.Array(JournalWrite),
}) {
  readonly [AdmitEventTypeId] = AdmitEventTypeId
}

export const EventAdmission = Schema.Union([Ignored, Recorded, Enqueued])
export type EventAdmission = typeof EventAdmission.Type

export class AdmitEvent extends Schema.TaggedClass<AdmitEvent>()('AdmitEvent', {
  execution: ExecutionState,
  mailbox: Mailbox,
  deferreds: Schema.Array(DeferredRow),
  clocks: Schema.Array(ClockRow),
  event: ExecutionEvent,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

type Writes = ReadonlyArray<JournalWrite>
type Admit = (writes: Writes) => EventAdmission
type DeferredDone = typeof ExecutionEvent.cases.DeferredDone.Type
type ClockFired = typeof ExecutionEvent.cases.ClockFired.Type

const recordOrIgnore: Admit = (writes) =>
  Arr.match(writes, {
    onEmpty: () => new Ignored({}),
    onNonEmpty: (nonEmpty) => new Recorded({ writes: nonEmpty }),
  })

// One replay serves every wake that arrives before it: a wake queued behind a pending replay
// is folded into it, so the loop never replays an execution twice for one burst of wakes.
const wakeThrough = (mailbox: Mailbox): Admit => (writes) =>
  Match.value(mailbox).pipe(
    Match.tag('Drained', () => new Enqueued({ writes })),
    Match.tag('ReplayPending', () => recordOrIgnore(writes)),
    Match.exhaustive,
  )

const completionByOrigin = (event: DeferredDone, wake: Admit): EventAdmission => {
  const writes: Writes = [{ _tag: 'CompleteDeferred', name: event.name, exit: event.exit }]
  return Match.value(event.origin).pipe(
    Match.tag('RunningReplay', () => recordOrIgnore(writes)),
    Match.tag('Outside', () => wake(writes)),
    Match.exhaustive,
  )
}

// The first writer of a deferred wins: a second completion writes nothing and wakes nothing.
const completeDeferred = (command: AdmitEvent, event: DeferredDone, wake: Admit): EventAdmission =>
  Option.match(Arr.findFirst(command.deferreds, (row) => row.name === event.name), {
    onNone: () => completionByOrigin(event, wake),
    onSome: () => new Ignored({}),
  })

// A clock fires once, whichever of its two timers gets there first.
const fireClock = (command: AdmitEvent, event: ClockFired, wake: Admit): EventAdmission =>
  Option.match(Arr.findFirst(command.clocks, (row) => row.name === event.name), {
    onNone: () => new Ignored({}),
    onSome: (row) =>
      Match.value(row).pipe(
        Match.tag('Fired', () => new Ignored({})),
        Match.tag('Scheduled', (scheduled) =>
          wake([{ _tag: 'FireClock', name: scheduled.name, deferred: scheduled.deferred }])),
        Match.exhaustive,
      ),
  })

const requestInterrupt = (interruption: Interruption, wake: Admit): EventAdmission =>
  Match.value(interruption).pipe(
    Match.tag('Requested', () => new Ignored({})),
    Match.tag('NotRequested', () => wake([{ _tag: 'RequestInterrupt' }])),
    Match.exhaustive,
  )

const admitToLive = (command: AdmitEvent, interruption: Interruption): EventAdmission => {
  const wake = wakeThrough(command.mailbox)
  return Match.value(command.event).pipe(
    Match.tag('Execute', () => new Ignored({})),
    Match.tag('Resume', 'AlarmWake', () => wake([])),
    Match.tag('DeferredDone', (event) => completeDeferred(command, event, wake)),
    Match.tag('ClockFired', (event) => fireClock(command, event, wake)),
    Match.tag('Interrupt', () => requestInterrupt(interruption, wake)),
    Match.exhaustive,
  )
}

// Before an execution exists only its start and its deferreds mean anything; there is
// nothing to replay, so a deferred completed early is stored and waits for the first run.
const admitToAbsent = (command: AdmitEvent): EventAdmission =>
  Match.value(command.event).pipe(
    Match.tag('Execute', (event) => new Enqueued({ writes: [{ _tag: 'CreateExecution', payload: event.payload }] })),
    Match.tag('DeferredDone', (event) => completeDeferred(command, event, recordOrIgnore)),
    Match.tag('Resume', 'ClockFired', 'Interrupt', 'AlarmWake', () => new Ignored({})),
    Match.exhaustive,
  )

const admissionOf = (command: AdmitEvent): EventAdmission =>
  Match.value(command.execution).pipe(
    Match.tag('Absent', () => admitToAbsent(command)),
    Match.tag('Running', 'Suspended', (live) => admitToLive(command, live.interruption)),
    Match.tag('Complete', () => new Ignored({})),
    Match.exhaustive,
  )

export const admitEvent = Workflow.make({
  command: AdmitEvent,
  decision: EventAdmission,
  error: Schema.Never,
  decide: (command): Result.Result<EventAdmission, never> => Result.succeed(admissionOf(command)),
})
