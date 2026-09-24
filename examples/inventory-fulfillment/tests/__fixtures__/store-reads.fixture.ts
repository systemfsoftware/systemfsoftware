import { Conformance } from '@systemfsoftware/conformance-spec'
import { Fulfillment, Inventory, Reservation } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Layer, Option } from 'effect'
import { CENTRAL_WAREHOUSE, inventorySeed, NORTH_WAREHOUSE, walkStock } from './inventory-store.fixture.js'
import { FIRST_ORDER, reservationLogSeed, SECOND_ORDER, UNKNOWN_ORDER } from './reservation-log.fixture.js'
import {
  InventoryReadCommand,
  inventoryReadModel,
  type LoggedOrder,
  type ReservationAnswer,
  ReservationReadCommand,
  reservationReadModel,
} from './store-reads.model.js'

const scopeOf = (scope: InventoryReadCommand['scope']): Option.Option<string> =>
  scope === 'all' ? Option.none() : Option.some(scope === 'central' ? CENTRAL_WAREHOUSE : NORTH_WAREHOUSE)

export const readCatalogue = (
  command: InventoryReadCommand,
): Effect.Effect<readonly string[], Fulfillment.Decision.StoreUnavailable, Inventory.Store.InventoryStore> =>
  Effect.flatMap(Inventory.Store.InventoryStore, (store) =>
    Effect.map(
      walkStock(store, { limit: 2, warehouseId: scopeOf(command.scope) }),
      (view) => view.lots.map((lot) => lot.lotId),
    ))

export const inventoryReadLayer: Layer.Layer<Inventory.Store.InventoryStore> = Inventory.Memory.layer(inventorySeed())

export const budgetedHistories = 12

export const inventoryReadSpec: Conformance.SequentialSpecification<
  InventoryReadCommand,
  number,
  readonly string[],
  Fulfillment.Decision.StoreUnavailable,
  Inventory.Store.InventoryStore
> = {
  commands: InventoryReadCommand,
  model: inventoryReadModel,
  run: readCatalogue,
  sequences: budgetedHistories,
  operations: 3,
}

const orderIdOf = (order: LoggedOrder): string =>
  order === 'first' ? FIRST_ORDER : order === 'second' ? SECOND_ORDER : UNKNOWN_ORDER

export const lookupReservation = (
  command: ReservationReadCommand,
): Effect.Effect<ReservationAnswer, Fulfillment.Decision.StoreUnavailable, Reservation.Log.ReservationLog> =>
  Effect.flatMap(
    Reservation.Log.ReservationLog,
    (log) =>
      Effect.map(log.findReservation(orderIdOf(command.order)), (found) =>
        Option.match(found, {
          onNone: (): ReservationAnswer => ({ found: false, customerId: '', lotIds: [] }),
          onSome: (record): ReservationAnswer => ({
            found: true,
            customerId: record.customerId,
            lotIds: record.allocations.map((allocation) => allocation.lotId),
          }),
        })),
  )

export const reservationReadLayer: Layer.Layer<Reservation.Log.ReservationLog> = Reservation.Memory.layer(
  reservationLogSeed(),
)

export const reservationReadSpec: Conformance.SequentialSpecification<
  ReservationReadCommand,
  number,
  ReservationAnswer,
  Fulfillment.Decision.StoreUnavailable,
  Reservation.Log.ReservationLog
> = {
  commands: ReservationReadCommand,
  model: reservationReadModel,
  run: lookupReservation,
  sequences: budgetedHistories,
  operations: 3,
}
