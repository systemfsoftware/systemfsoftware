import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Schema } from 'effect'
import * as Result from 'effect/Result'
import { AdmitEvent, admitEvent, Enqueued, EventAdmission, Ignored, Recorded } from '../admit-event.workflow.js'
import {
  ClockName,
  ClockRow,
  DeferredName,
  DeferredOrigin,
  DeferredRow,
  EncodedExit,
  EncodedPayload,
  ExecutionEvent,
  ExecutionState,
  Interruption,
  JournalWrite,
  Mailbox,
} from '../journal.schema.js'

type Subject = typeof admitEvent
type LiveTag = 'Running' | 'Suspended'

type Journal = {
  readonly execution: ExecutionState
  readonly mailbox: Mailbox
  readonly deferreds?: ReadonlyArray<DeferredRow>
  readonly clocks?: ReadonlyArray<ClockRow>
}

const drained: Mailbox = { _tag: 'Drained' }
const replayPending: Mailbox = { _tag: 'ReplayPending' }
const absent: ExecutionState = { _tag: 'Absent' }

const live = (tag: LiveTag, interruption: Interruption): ExecutionState => ({ _tag: tag, interruption })

const admissionOf = (subject: Subject, journal: Journal, event: ExecutionEvent): EventAdmission =>
  Result.match(
    subject(
      new AdmitEvent({
        execution: journal.execution,
        mailbox: journal.mailbox,
        deferreds: journal.deferreds ?? [],
        clocks: journal.clocks ?? [],
        event,
      }),
    ),
    { onFailure: (missing: never) => missing, onSuccess: (admission) => admission },
  )

const sameWrites = (actual: ReadonlyArray<JournalWrite>, expected: ReadonlyArray<JournalWrite>): boolean =>
  Schema.toEquivalence(Schema.Array(JournalWrite))(actual, expected)

const isRecorded = (admission: EventAdmission, writes: ReadonlyArray<JournalWrite>): boolean =>
  Schema.is(Recorded)(admission) && sameWrites(admission.writes, writes)

const isEnqueued = (admission: EventAdmission, writes: ReadonlyArray<JournalWrite>): boolean =>
  Schema.is(Enqueued)(admission) && sameWrites(admission.writes, writes)

// A name no drawn row carries: the property is stated only when the drawn name lies outside every row.
const isNameOutside = (rows: ReadonlyArray<{ readonly name: string }>, name: string): boolean =>
  Arr.every(rows, (row) => row.name !== name)

const decisionOf = (subject: Subject, command: AdmitEvent): EventAdmission =>
  Result.match(subject(command), { onFailure: (missing: never) => missing, onSuccess: (admission) => admission })

// Kills an engine that lets a finished execution be written to or replayed again.
it.prop(
  '∀e_Complete_=Ignored',
  {
    of: [EncodedExit, Mailbox, Schema.Array(DeferredRow), Schema.Array(ClockRow), ExecutionEvent],
    subject: admitEvent,
  },
  (subject, [exit, mailbox, deferreds, clocks, event]) =>
    Schema.is(Ignored)(
      admissionOf(subject, { execution: { _tag: 'Complete', exit }, mailbox, deferreds, clocks }, event),
    ),
)

// Kills an engine that queues a second replay behind a pending one (R119: one replay per burst).
it.prop(
  '∀e_ReplayPending_≠Enqueued',
  {
    of: [
      Schema.Literals(['Running', 'Suspended']),
      Interruption,
      Schema.Array(DeferredRow),
      Schema.Array(ClockRow),
      ExecutionEvent,
    ],
    subject: admitEvent,
  },
  (subject, [tag, interruption, deferreds, clocks, event]) =>
    !(Schema.is(Enqueued)(admissionOf(
      subject,
      { execution: live(tag, interruption), mailbox: replayPending, deferreds, clocks },
      event,
    ))),
)

// Kills an engine that drops a completion because a replay is already pending.
it.prop(
  '∀d_ReplayPending_=Recorded',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, Schema.Array(DeferredRow), DeferredName, EncodedExit],
    subject: admitEvent,
  },
  (subject, [tag, interruption, deferreds, name, exit]) => {
    if (!isNameOutside(deferreds, name)) return true
    const admission = admissionOf(subject, { execution: live(tag, interruption), mailbox: replayPending, deferreds }, {
      _tag: 'DeferredDone',
      name,
      exit,
      origin: { _tag: 'Outside' },
    })
    return isRecorded(admission, [{ _tag: 'CompleteDeferred', name, exit }])
  },
)

// Kills a second writer overwriting a completed deferred, or waking the execution for it.
it.prop(
  '∀d_Completed_=Ignored',
  {
    of: [ExecutionState, Mailbox, DeferredRow, Schema.Array(DeferredRow), EncodedExit, DeferredOrigin],
    subject: admitEvent,
  },
  (subject, [execution, mailbox, first, others, exit, origin]) =>
    Schema.is(Ignored)(admissionOf(subject, { execution, mailbox, deferreds: [first, ...others] }, {
      _tag: 'DeferredDone',
      name: first.name,
      exit,
      origin,
    })),
)

// Kills a wake for a deferred the execution's own running replay completed (4.0.1 completedDeferreds).
it.prop(
  '∀d_RunningReplay_=Recorded',
  {
    of: [
      Schema.Literals(['Running', 'Suspended']),
      Interruption,
      Mailbox,
      Schema.Array(DeferredRow),
      DeferredName,
      EncodedExit,
    ],
    subject: admitEvent,
  },
  (subject, [tag, interruption, mailbox, deferreds, name, exit]) => {
    if (!isNameOutside(deferreds, name)) return true
    const admission = admissionOf(subject, { execution: live(tag, interruption), mailbox, deferreds }, {
      _tag: 'DeferredDone',
      name,
      exit,
      origin: { _tag: 'RunningReplay' },
    })
    return isRecorded(admission, [{ _tag: 'CompleteDeferred', name, exit }])
  },
)

// Kills an engine that stores an outside completion but never replays the execution to observe it.
it.prop(
  '∀d_OutsideDrained_=Enqueued',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, Schema.Array(DeferredRow), DeferredName, EncodedExit],
    subject: admitEvent,
  },
  (subject, [tag, interruption, deferreds, name, exit]) => {
    if (!isNameOutside(deferreds, name)) return true
    const admission = admissionOf(subject, { execution: live(tag, interruption), mailbox: drained, deferreds }, {
      _tag: 'DeferredDone',
      name,
      exit,
      origin: { _tag: 'Outside' },
    })
    return isEnqueued(admission, [{ _tag: 'CompleteDeferred', name, exit }])
  },
)

// Kills an engine that loses a deferred completed before its execution starts.
it.prop(
  '∀d_Absent_=Recorded',
  { of: [Mailbox, Schema.Array(DeferredRow), DeferredName, EncodedExit, DeferredOrigin], subject: admitEvent },
  (subject, [mailbox, deferreds, name, exit, origin]) => {
    if (!isNameOutside(deferreds, name)) return true
    const admission = admissionOf(subject, { execution: absent, mailbox, deferreds }, {
      _tag: 'DeferredDone',
      name,
      exit,
      origin,
    })
    return isRecorded(admission, [{ _tag: 'CompleteDeferred', name, exit }])
  },
)

// Kills a clock that fires twice when its sleep and its alarm both reach it.
it.prop(
  '∀c_Fired_=Ignored',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, Mailbox, ClockName, Schema.Array(ClockRow)],
    subject: admitEvent,
  },
  (subject, [tag, interruption, mailbox, name, others]) =>
    Schema.is(Ignored)(admissionOf(subject, {
      execution: live(tag, interruption),
      mailbox,
      clocks: [{ _tag: 'Fired', name }, ...others],
    }, { _tag: 'ClockFired', name })),
)

// Kills a due clock that never completes its deferred or never wakes the execution.
it.prop(
  '∀c_ScheduledDrained_=Enqueued',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, ClockRow.cases.Scheduled, Schema.Array(ClockRow)],
    subject: admitEvent,
  },
  (subject, [tag, interruption, scheduled, others]) => {
    const admission = admissionOf(subject, {
      execution: live(tag, interruption),
      mailbox: drained,
      clocks: [scheduled, ...others],
    }, { _tag: 'ClockFired', name: scheduled.name })
    return isEnqueued(admission, [{ _tag: 'FireClock', name: scheduled.name, deferred: scheduled.deferred }])
  },
)

// Kills an engine that fires a clock the execution never scheduled.
it.prop(
  '∀c_Unscheduled_=Ignored',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, Mailbox, Schema.Array(ClockRow), ClockName],
    subject: admitEvent,
  },
  (subject, [tag, interruption, mailbox, clocks, name]) => {
    if (!isNameOutside(clocks, name)) return true
    return Schema.is(Ignored)(admissionOf(subject, { execution: live(tag, interruption), mailbox, clocks }, {
      _tag: 'ClockFired',
      name,
    }))
  },
)

// Kills an engine that never creates the execution it was asked to start.
it.prop(
  '∀p_AbsentExecute_=Enqueued',
  { of: [Mailbox, EncodedPayload], subject: admitEvent },
  (subject, [mailbox, payload]) =>
    isEnqueued(admissionOf(subject, { execution: absent, mailbox }, { _tag: 'Execute', payload }), [
      { _tag: 'CreateExecution', payload },
    ]),
)

// Kills an engine that wakes, fires or interrupts an execution that does not exist.
it.prop(
  '∀e_AbsentWake_=Ignored',
  {
    of: [
      Mailbox,
      Schema.Array(ClockRow),
      Schema.Union([
        ExecutionEvent.cases.Resume,
        ExecutionEvent.cases.ClockFired,
        ExecutionEvent.cases.Interrupt,
        ExecutionEvent.cases.AlarmWake,
      ]),
    ],
    subject: admitEvent,
  },
  (subject, [mailbox, clocks, event]) =>
    Schema.is(Ignored)(admissionOf(subject, { execution: absent, mailbox, clocks }, event)),
)

// Kills an engine that restarts a live execution when asked to start it again.
it.prop(
  '∀p_LiveExecute_=Ignored',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, Mailbox, EncodedPayload],
    subject: admitEvent,
  },
  (subject, [tag, interruption, mailbox, payload]) =>
    Schema.is(Ignored)(
      admissionOf(subject, { execution: live(tag, interruption), mailbox }, { _tag: 'Execute', payload }),
    ),
)

// Kills an engine that drops a resume or an alarm wake while no replay is pending.
it.prop(
  '∀w_LiveDrained_=Enqueued',
  {
    of: [
      Schema.Literals(['Running', 'Suspended']),
      Interruption,
      Schema.Union([ExecutionEvent.cases.Resume, ExecutionEvent.cases.AlarmWake]),
    ],
    subject: admitEvent,
  },
  (subject, [tag, interruption, event]) =>
    isEnqueued(admissionOf(subject, { execution: live(tag, interruption), mailbox: drained }, event), []),
)

// Kills an engine that records a second interrupt request.
it.prop(
  '∀i_Requested_=Ignored',
  { of: [Schema.Literals(['Running', 'Suspended']), Mailbox], subject: admitEvent },
  (subject, [tag, mailbox]) =>
    Schema.is(Ignored)(
      admissionOf(subject, { execution: live(tag, { _tag: 'Requested' }), mailbox }, { _tag: 'Interrupt' }),
    ),
)

// Kills an engine that drops an interrupt, or never replays the execution to run its finalizers.
it.prop(
  '∀i_NotRequestedDrained_=Enqueued',
  { of: [Schema.Literals(['Running', 'Suspended'])], subject: admitEvent },
  (subject, [tag]) =>
    isEnqueued(
      admissionOf(subject, { execution: live(tag, { _tag: 'NotRequested' }), mailbox: drained }, { _tag: 'Interrupt' }),
      [{ _tag: 'RequestInterrupt' }],
    ),
)

// Kills an engine that records a due clock's completion without its fire write while a replay waits.
it.prop(
  '∀c_ScheduledReplayPending_=Recorded',
  {
    of: [Schema.Literals(['Running', 'Suspended']), Interruption, ClockRow.cases.Scheduled, Schema.Array(ClockRow)],
    subject: admitEvent,
  },
  (subject, [tag, interruption, scheduled, others]) => {
    const admission = admissionOf(subject, {
      execution: live(tag, interruption),
      mailbox: replayPending,
      clocks: [scheduled, ...others],
    }, { _tag: 'ClockFired', name: scheduled.name })
    return isRecorded(admission, [{ _tag: 'FireClock', name: scheduled.name, deferred: scheduled.deferred }])
  },
)

// Kills an engine that records the first interrupt without the write while a replay waits.
it.prop(
  '∀i_NotRequestedReplayPending_=Recorded',
  { of: [Schema.Literals(['Running', 'Suspended'])], subject: admitEvent },
  (subject, [tag]) =>
    isRecorded(
      admissionOf(
        subject,
        { execution: live(tag, { _tag: 'NotRequested' }), mailbox: replayPending },
        { _tag: 'Interrupt' },
      ),
      [{ _tag: 'RequestInterrupt' }],
    ),
)

// Kills a decision that is not a function of its command: the same command must decide the same way.
it.prop(
  '∀c_AdmitEvent_=AdmitEvent',
  { of: [AdmitEvent], subject: admitEvent },
  (subject, [command]) => {
    const decisionEq = Schema.toEquivalence(EventAdmission)
    return decisionEq(decisionOf(subject, command), decisionOf(subject, command))
  },
)
