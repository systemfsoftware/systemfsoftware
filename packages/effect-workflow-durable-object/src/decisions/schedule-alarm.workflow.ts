import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Number as Num, Option, Order, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ClockRow, EpochMillis, LATEST_EPOCH_MILLIS, LeaseMillis, Mailbox } from './journal.schema.js'

const ScheduleAlarmTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-workflow-durable-object/ScheduleAlarm',
)

/** Arm the object's alarm for an instant. */
export class ArmAlarm extends Schema.TaggedClass<ArmAlarm>()('ArmAlarm', {
  at: EpochMillis,
}) {
  readonly [ScheduleAlarmTypeId] = ScheduleAlarmTypeId
}

/** Clear the object's alarm: no event waits and no clock is due. */
export class ClearAlarm extends Schema.TaggedClass<ClearAlarm>()('ClearAlarm', {}) {
  readonly [ScheduleAlarmTypeId] = ScheduleAlarmTypeId
}

export const AlarmSchedule = Schema.Union([ArmAlarm, ClearAlarm])
export type AlarmSchedule = typeof AlarmSchedule.Type

export class ScheduleAlarm extends Schema.TaggedClass<ScheduleAlarm>()('ScheduleAlarm', {
  now: EpochMillis,
  lease: LeaseMillis,
  mailbox: Mailbox,
  clocks: Schema.Array(ClockRow),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const wakeTimeOf = (row: ClockRow): Option.Option<EpochMillis> =>
  Match.value(row).pipe(
    Match.tag('Scheduled', (scheduled) => Option.some(scheduled.wakeAt)),
    Match.tag('Fired', () => Option.none()),
    Match.exhaustive,
  )

const earliestClock = (clocks: ReadonlyArray<ClockRow>): Option.Option<EpochMillis> =>
  Arr.match(Arr.getSomes(Arr.map(clocks, wakeTimeOf)), {
    onEmpty: () => Option.none(),
    onNonEmpty: (wakeTimes) => Option.some(Arr.min(wakeTimes, Order.Number)),
  })

// While an event waits, the alarm is the lease that recovers an aborted or evicted drain;
// a clock due before the lease ends still wakes on time.
const leaseOrClock = (command: ScheduleAlarm, earliest: Option.Option<EpochMillis>): ArmAlarm => {
  const leaseEnd = EpochMillis.make(Num.min(command.now + command.lease, LATEST_EPOCH_MILLIS))
  return new ArmAlarm({
    at: Option.match(earliest, {
      onNone: () => leaseEnd,
      onSome: (clock) => EpochMillis.make(Num.min(clock, leaseEnd)),
    }),
  })
}

const scheduleOf = (command: ScheduleAlarm): AlarmSchedule => {
  const earliest = earliestClock(command.clocks)
  return Match.value(command.mailbox).pipe(
    Match.tag('ReplayPending', () => leaseOrClock(command, earliest)),
    Match.tag('Drained', () =>
      Option.match(earliest, {
        onNone: () => new ClearAlarm({}),
        onSome: (at) => new ArmAlarm({ at }),
      })),
    Match.exhaustive,
  )
}

export const scheduleAlarm = Workflow.make({
  command: ScheduleAlarm,
  decision: AlarmSchedule,
  error: Schema.Never,
  decide: (command): Result.Result<AlarmSchedule, never> => Result.succeed(scheduleOf(command)),
})
