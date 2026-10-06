import { it } from '@systemfsoftware/vitest'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ClockRow, EpochMillis, LeaseMillis, type Mailbox } from '../journal.schema.js'
import { type AlarmSchedule, ClearAlarm, ScheduleAlarm, scheduleAlarm } from '../schedule-alarm.workflow.js'

type Subject = typeof scheduleAlarm

const scheduleOf = (
  subject: Subject,
  now: EpochMillis,
  lease: LeaseMillis,
  mailbox: Mailbox,
  clocks: ReadonlyArray<ClockRow>,
): AlarmSchedule =>
  Result.match(subject(new ScheduleAlarm({ now, lease, mailbox, clocks })), {
    onFailure: (missing: never) => missing,
    onSuccess: (schedule) => schedule,
  })

const armedAt = (schedule: AlarmSchedule): Option.Option<number> =>
  Match.value(schedule).pipe(
    Match.tag('ArmAlarm', (armed) => Option.some<number>(armed.at)),
    Match.tag('ClearAlarm', () => Option.none()),
    Match.exhaustive,
  )

const isArmedAt = (schedule: AlarmSchedule, at: number): boolean =>
  Option.match(armedAt(schedule), { onNone: () => false, onSome: (armed) => armed === at })

// Kills an alarm that is cleared or pushed past the lease while an event waits: an aborted or
// evicted drain must be recovered within one lease.
it.prop(
  '∀n_ReplayPendingNoClock_=NowPlusLease',
  { of: [EpochMillis, LeaseMillis, Schema.Array(ClockRow.cases.Fired)], subject: scheduleAlarm },
  (subject, [now, lease, fired]) =>
    isArmedAt(
      scheduleOf(subject, now, lease, { _tag: 'ReplayPending' }, fired),
      Math.min(now + lease, 8_640_000_000_000_000),
    ),
)

// Kills an alarm that lets a clock due inside the lease wait for the lease to end.
it.prop(
  '∀c_ReplayPendingDueClock_=ClockWake',
  { of: [ClockRow.cases.Scheduled, LeaseMillis, Schema.Array(ClockRow.cases.Fired)], subject: scheduleAlarm },
  (subject, [due, lease, fired]) =>
    isArmedAt(scheduleOf(subject, due.wakeAt, lease, { _tag: 'ReplayPending' }, [...fired, due]), due.wakeAt),
)

// Kills an alarm that fires a clock early or late once every event is processed.
it.prop(
  '∀c_Drained_=EarliestClock',
  {
    of: [
      EpochMillis,
      LeaseMillis,
      ClockRow.cases.Scheduled,
      Schema.Array(ClockRow.cases.Scheduled),
      Schema.Array(ClockRow.cases.Fired),
    ],
    subject: scheduleAlarm,
  },
  (subject, [now, lease, first, others, fired]) =>
    isArmedAt(
      scheduleOf(subject, now, lease, { _tag: 'Drained' }, [...fired, first, ...others]),
      Math.min(first.wakeAt, ...others.map((clock) => clock.wakeAt)),
    ),
)

// Kills an alarm left armed when nothing waits and no clock is due.
it.prop(
  '∀n_DrainedNoClock_=ClearAlarm',
  { of: [EpochMillis, LeaseMillis, Schema.Array(ClockRow.cases.Fired)], subject: scheduleAlarm },
  (subject, [now, lease, fired]) => Schema.is(ClearAlarm)(scheduleOf(subject, now, lease, { _tag: 'Drained' }, fired)),
)
