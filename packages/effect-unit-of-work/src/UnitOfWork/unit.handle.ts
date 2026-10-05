import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, Option, Ref } from 'effect'
import { dual } from 'effect/Function'
import { driverWhenOpen, Ended, Open, type UnitState } from './unit-state.schema.js'
import { UnitEnded } from './UnitEnded.schema.js'

type Top<A = unknown> = A

/** The identity every unit carries. */
export const TypeId = Symbol.for('@systemfsoftware/effect-unit-of-work/Unit')
export type TypeId = typeof TypeId

/**
 * The private state a unit carries: the adapter's driver bound to one transaction, and the unit's
 * open state. The driver's type is the handle's index, so a unit handed to a cell names its own
 * driver's operations and nothing else.
 */
export interface UnitDriverSlot<D> {
  readonly driver: D
  readonly state: Ref.Ref<UnitState>
}

export interface UnitSlot extends Handle.Indexed {
  readonly slot: UnitDriverSlot<this['Index']>
}

const Unit = Handle.make<Record<never, never>, UnitSlot, Top>()(TypeId)

/** A unit of work: the adapter's driver, reachable only while the unit is open. */
export type Unit<D> = Handle.Handle<typeof TypeId, Record<never, never>, UnitSlot, D>

/** Returns `true` when a value is a unit. */
export const isUnit = Unit.is

/**
 * Mints a unit over an adapter driver. Only an adapter mints units, and only the adapter's own
 * frame closes them (KTD2), so this stays off the published namespace.
 */
export const mint = <D>(driver: D): Effect.Effect<Unit<D>> =>
  Effect.map(Ref.make<UnitState>(Open.make({})), (state) => Unit.make<D>({}, { driver, state }))

/**
 * Closes a unit. The adapter calls this from its own frame — after the callback returns, whatever
 * its exit — never from a scope finalizer inside the unit's fiber (KTD2).
 */
export const close = <D>(unit: Unit<D>): Effect.Effect<void> => Ref.set(Unit.slot(unit).state, Ended.make({}))

/**
 * Reaches the driver behind a unit while the unit is open. An operation on a unit whose work has
 * ended dies with {@link UnitEnded} before the driver is touched.
 */
export const use: {
  <D, A, E, R>(f: (driver: D) => Effect.Effect<A, E, R>): (unit: Unit<D>) => Effect.Effect<A, E, R>
  <D, A, E, R>(unit: Unit<D>, f: (driver: D) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = dual(
  2,
  <D, A, E, R>(unit: Unit<D>, f: (driver: D) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(
      Ref.get(Unit.slot(unit).state),
      (state) =>
        Option.match(driverWhenOpen(state, Unit.slot(unit).driver), {
          onNone: () => Effect.die(new UnitEnded({})),
          onSome: (driver) => f(driver),
        }),
    ),
)
