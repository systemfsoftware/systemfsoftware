import { Match, Option, Schema } from 'effect'
import { dual } from 'effect/Function'

/** The unit is live: its driver may be reached. */
export class Open extends Schema.TaggedClass<Open>()('Open', {}) {}

/** The unit's work has ended: every operation on it dies before its driver is touched. */
export class Ended extends Schema.TaggedClass<Ended>()('Ended', {}) {}

/** Whether a unit is live or has ended — a closed union, never a boolean field. */
export type UnitState = Open | Ended

/**
 * The decision every unit operation reaches first: the driver is reachable only while the unit is
 * open. The caller turns the empty case into the {@link UnitEnded} defect.
 */
const driverWhenOpenOver = <D>(state: UnitState, driver: D): Option.Option<D> =>
  Match.value(state).pipe(
    Match.tag('Open', () => Option.some(driver)),
    Match.tag('Ended', () => Option.none()),
    Match.exhaustive,
  )

export const driverWhenOpen: {
  <D>(driver: D): (state: UnitState) => Option.Option<D>
  <D>(state: UnitState, driver: D): Option.Option<D>
} = dual(2, driverWhenOpenOver)
