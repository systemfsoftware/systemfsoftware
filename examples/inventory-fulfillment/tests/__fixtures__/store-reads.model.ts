import { Schema } from 'effect'

export const CatalogueScope = Schema.Literals(['all', 'central', 'north'])
export type CatalogueScope = Schema.Schema.Type<typeof CatalogueScope>

export const InventoryReadCommand = Schema.Union([
  Schema.TaggedStruct('ReadCatalogue', { scope: CatalogueScope }),
])
export type InventoryReadCommand = Schema.Schema.Type<typeof InventoryReadCommand>

export const CATALOGUE_LOT_IDS: Readonly<Record<CatalogueScope, readonly string[]>> = {
  all: ['lot-kettle-a', 'lot-kettle-b', 'lot-mug-a', 'lot-teapot-a', 'lot-teapot-north'],
  central: ['lot-kettle-a', 'lot-kettle-b', 'lot-teapot-a'],
  north: ['lot-mug-a', 'lot-teapot-north'],
}

export const inventoryReadModel = {
  state: Schema.Finite,
  initial: 0,
  step: (_state: number, command: InventoryReadCommand): readonly [number, readonly string[]] => [
    0,
    CATALOGUE_LOT_IDS[command.scope],
  ],
  precondition: () => true,
}

export const LoggedOrder = Schema.Literals(['first', 'second', 'missing'])
export type LoggedOrder = Schema.Schema.Type<typeof LoggedOrder>

export const ReservationReadCommand = Schema.Union([
  Schema.TaggedStruct('Lookup', { order: LoggedOrder }),
])
export type ReservationReadCommand = Schema.Schema.Type<typeof ReservationReadCommand>

export interface ReservationAnswer {
  readonly found: boolean
  readonly customerId: string
  readonly lotIds: readonly string[]
}

const ABSENT: ReservationAnswer = { found: false, customerId: '', lotIds: [] }

export const RESERVATION_ANSWERS: Readonly<Record<LoggedOrder, ReservationAnswer>> = {
  first: { found: true, customerId: 'customer-one', lotIds: ['lot-kettle-a', 'lot-teapot-a'] },
  second: { found: true, customerId: 'customer-two', lotIds: ['lot-mug-a'] },
  missing: ABSENT,
}

export const reservationReadModel = {
  state: Schema.Finite,
  initial: 0,
  step: (_state: number, command: ReservationReadCommand): readonly [number, ReservationAnswer] => [
    0,
    RESERVATION_ANSWERS[command.order],
  ],
  precondition: () => true,
}
