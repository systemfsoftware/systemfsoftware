import { Array as Arr, Match, Option, Record as Record_ } from 'effect'
import type { InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { LotAllocation } from '../inventory/inventory.schema.js'

const CreditProofId: unique symbol = Symbol('CreditProof')
const StockProofId: unique symbol = Symbol('StockProof')

/**
 * The keys live in this module, so only the settlement adapters that import it
 * can mint a proof; an object literal elsewhere cannot spell the property.
 */
export interface CreditProof {
  readonly [CreditProofId]: { readonly customerId: string; readonly version: number }
}

export interface StockProof {
  readonly [StockProofId]: { readonly versions: Readonly<Record<string, number>> }
}

export const mintCreditProof = (observation: {
  readonly customerId: string
  readonly version: number
}): CreditProof => ({
  [CreditProofId]: { customerId: observation.customerId, version: observation.version },
})

export const mintStockProof = (versions: Readonly<Record<string, number>>): StockProof => ({
  [StockProofId]: { versions },
})

export const creditObservation = (proof: CreditProof): { readonly customerId: string; readonly version: number } =>
  proof[CreditProofId]

export const stockObservation = (proof: StockProof): Readonly<Record<string, number>> => proof[StockProofId].versions

export interface ClaimedLot {
  readonly lotId: string
  readonly sku: string
  readonly warehouseId: string
  readonly quantity: number
  readonly observedVersion: number
}

const reservedAllocations = (events: readonly InventoryReservationEvents[]): readonly LotAllocation[] =>
  Arr.flatten(Arr.getSomes(Arr.map(events, (event) =>
    Match.value(event).pipe(
      Match.tag('StockReserved', (reserved) => Option.some(reserved.allocations)),
      Match.tag('BackorderRecorded', 'ReservationRolledBack', () => Option.none<readonly LotAllocation[]>()),
      Match.exhaustive,
    ))))

/**
 * Allocations are summed per lot first, so one order drawing twice from a lot
 * claims it once. A lot the proof does not vouch for leaves the command with no
 * claim at all.
 */
export const claimedLots = (command: {
  readonly events: readonly InventoryReservationEvents[]
  readonly stock: StockProof
}): Option.Option<readonly ClaimedLot[]> =>
  Option.all(Arr.map(
    Record_.toEntries(Arr.groupBy(reservedAllocations(command.events), (allocation) => allocation.lotId)),
    ([lotId, group]) => {
      const first = Arr.headNonEmpty(group)
      return Option.map(Option.fromUndefinedOr(stockObservation(command.stock)[lotId]), (observedVersion) => ({
        lotId,
        sku: first.sku,
        warehouseId: first.warehouseId,
        quantity: Arr.reduce(group, 0, (total, allocation) => total + allocation.quantity),
        observedVersion,
      }))
    },
  ))
