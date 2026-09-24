import { describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import type { StockLot } from '../../inventory/inventory.schema.js'
import {
  type CreditLimitExceeded,
  type InsufficientStock,
  type LotReservation,
  type OrderAllocated,
  type OrderAllocatedWithOverdraft,
  type OrderBackordered,
  type OrderHeld,
  placeOrder,
  PlaceOrderCommand,
} from '../place-order.workflow.js'

type PlaceOrderResult = Result.Result<
  OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld,
  InsufficientStock | CreditLimitExceeded
>

const explodedComponentsOf = (
  command: PlaceOrderCommand,
): readonly { readonly sku: string; readonly quantity: number }[] =>
  Arr.flatMap(command.lines, (line) =>
    Option.match(Arr.findFirst(command.kits, (kit) => kit.kitSku === line.sku), {
      onNone: () => Arr.of({ sku: line.sku, quantity: line.quantity }),
      onSome: (kit) =>
        Arr.map(kit.components, (component) => ({
          sku: component.sku,
          quantity: component.quantity * line.quantity,
        })),
    }))

const headroomOfAccount = (account: PlaceOrderCommand['account']): number =>
  Num.max(0, account.creditLimit - account.outstandingBalance)

const expectedSpendOf = (command: PlaceOrderCommand): number =>
  Arr.reduce(explodedComponentsOf(command), 0, (total, component) => total + component.quantity)

const shortfallPredictedOf = (command: PlaceOrderCommand): number =>
  Num.max(0, expectedSpendOf(command) - headroomOfAccount(command.account))

const creditPredictedOf = (command: PlaceOrderCommand): 'granted' | 'held' | 'refused' => {
  const shortfall = shortfallPredictedOf(command)
  if (command.tier === 'Standard') {
    return shortfall === 0 ? 'granted' : 'held'
  }
  return shortfall <= command.account.overdraftPrivilege ? 'granted' : 'refused'
}

const creditObservedOf = (result: PlaceOrderResult): string =>
  Result.match(result, {
    onFailure: (error) =>
      Match.value(error).pipe(
        Match.tag('InsufficientStock', () => 'stock-refused'),
        Match.tag('CreditLimitExceeded', () => 'refused'),
        Match.exhaustive,
      ),
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('OrderHeld', () => 'held'),
        Match.tag('OrderAllocated', () => 'granted'),
        Match.tag('OrderAllocatedWithOverdraft', () => 'granted'),
        Match.tag('OrderBackordered', () => 'backordered'),
        Match.exhaustive,
      ),
  })

const agreesWithTierContract = (command: PlaceOrderCommand, result: PlaceOrderResult): boolean =>
  Match.value(`${creditPredictedOf(command)}:${creditObservedOf(result)}`).pipe(
    Match.when('granted:granted', () => true),
    Match.when('held:held', () => true),
    Match.when('refused:refused', () => true),
    Match.when('granted:backordered', () => true),
    Match.when('held:backordered', () => true),
    Match.when('granted:stock-refused', () => true),
    Match.when('held:stock-refused', () => true),
    Match.when('refused:stock-refused', () => true),
    Match.orElse(() => false),
  )

const liveLotsOf = (command: PlaceOrderCommand): readonly StockLot[] =>
  Arr.filter(
    Arr.flatMap(command.stock, (partition) => partition.lots),
    (lot) =>
      Option.getOrElse(
        Option.map(lot.expiresAt, (expiresAt) => expiresAt.epochMilliseconds > command.now.epochMilliseconds),
        () => true,
      ),
  )

const liveAvailabilityOf = (command: PlaceOrderCommand): ReadonlyMap<string, number> =>
  Arr.reduce(
    liveLotsOf(command),
    new Map<string, number>(),
    (totals, lot) => totals.set(lot.sku, (totals.get(lot.sku) ?? 0) + lot.quantityOnHand),
  )

const demandedOf = (command: PlaceOrderCommand): ReadonlyMap<string, number> =>
  Arr.reduce(
    explodedComponentsOf(command),
    new Map<string, number>(),
    (totals, demand) => totals.set(demand.sku, (totals.get(demand.sku) ?? 0) + demand.quantity),
  )

const allocatedBySkuOf = (reservations: readonly LotReservation[]): ReadonlyMap<string, number> =>
  Arr.reduce(
    reservations,
    new Map<string, number>(),
    (totals, reservation) => totals.set(reservation.sku, (totals.get(reservation.sku) ?? 0) + reservation.quantity),
  )

const satisfiedBySkuOf = (
  reservations: readonly LotReservation[],
  unfulfilled: readonly { readonly sku: string; readonly quantity: number }[],
): ReadonlyMap<string, number> =>
  Arr.reduce(
    unfulfilled,
    allocatedBySkuOf(reservations),
    (totals, demand) => new Map(totals).set(demand.sku, (totals.get(demand.sku) ?? 0) + demand.quantity),
  )

const matchesDemanded = (
  command: PlaceOrderCommand,
  reservations: readonly LotReservation[],
  unfulfilled: readonly { readonly sku: string; readonly quantity: number }[],
): boolean => {
  const demanded = demandedOf(command)
  const satisfied = satisfiedBySkuOf(reservations, unfulfilled)
  return Arr.every(
    Arr.dedupe([...Arr.fromIterable(demanded.keys()), ...Arr.fromIterable(satisfied.keys())]),
    (sku) => (satisfied.get(sku) ?? 0) === (demanded.get(sku) ?? 0),
  )
}

const allocatedMatchesLive = (
  command: PlaceOrderCommand,
  reservations: readonly LotReservation[],
): boolean => {
  const available = liveAvailabilityOf(command)
  const allocatedBySku = allocatedBySkuOf(reservations)
  return Arr.every(
    Arr.fromIterable(allocatedBySku.keys()),
    (sku) => (allocatedBySku.get(sku) ?? 0) <= (available.get(sku) ?? 0),
  )
}
const everyReservationLive = (
  command: PlaceOrderCommand,
  reservations: readonly LotReservation[],
): boolean => {
  const liveIds = new Set(Arr.map(liveLotsOf(command), (lot) => lot.lotId))
  return Arr.every(reservations, (reservation) => liveIds.has(reservation.lotId))
}

const refusesLiveDemand = (command: PlaceOrderCommand, refusal: InsufficientStock): boolean =>
  (demandedOf(command).get(refusal.sku) ?? 0) === refusal.requested &&
  refusal.requested > 0 &&
  (liveAvailabilityOf(command).get(refusal.sku) ?? 0) === 0 &&
  refusal.available === 0

const refusalExplained = (command: PlaceOrderCommand, error: InsufficientStock | CreditLimitExceeded): boolean =>
  Match.value(error).pipe(
    Match.tag('CreditLimitExceeded', () => creditPredictedOf(command) === 'refused'),
    Match.tag('InsufficientStock', (refusal) => refusesLiveDemand(command, refusal)),
    Match.exhaustive,
  )

const emptyComponents = (command: PlaceOrderCommand): boolean => explodedComponentsOf(command).length === 0
const stockLedgerHolds = (command: PlaceOrderCommand): boolean => creditPredictedOf(command) === 'held'
const overdraftWithinPrivilege = (command: PlaceOrderCommand): boolean =>
  Result.match(placeOrder(command), {
    onFailure: (error) => refusalExplained(command, error),
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('OrderAllocatedWithOverdraft', (allocated) =>
          command.tier === 'VIP' &&
          allocated.overdraftAmount > 0 &&
          allocated.overdraftAmount <= command.account.overdraftPrivilege &&
          allocated.overdraftAmount === shortfallPredictedOf(command)),
        Match.tag('OrderAllocated', () => true),
        Match.tag('OrderBackordered', () => true),
        Match.tag('OrderHeld', () => true),
        Match.exhaustive,
      ),
  })

describe('placeOrder — composed pipeline', () => {
  it.prop(
    '∀c_CreditOutcome_=Tier',
    [PlaceOrderCommand],
    ([command]) => agreesWithTierContract(command, placeOrder(command)),
  )

  it.prop('∀c_Overdraft_≤Privilege', [PlaceOrderCommand], ([command]) => overdraftWithinPrivilege(command))

  it.prop('∀c_AllocateStock_≤Stock', [PlaceOrderCommand], ([command]) =>
    Result.match(placeOrder(command), {
      onFailure: (error) => refusalExplained(command, error),
      onSuccess: (decision) =>
        Match.value(decision).pipe(
          Match.tag('OrderHeld', () => stockLedgerHolds(command)),
          Match.tag(
            'OrderAllocated',
            (allocated) => allocatedMatchesLive(command, allocated.reservations) || emptyComponents(command),
          ),
          Match.tag(
            'OrderAllocatedWithOverdraft',
            (allocated) => allocatedMatchesLive(command, allocated.reservations) || emptyComponents(command),
          ),
          Match.tag(
            'OrderBackordered',
            (backordered) => allocatedMatchesLive(command, backordered.reservations) || emptyComponents(command),
          ),
          Match.exhaustive,
        ),
    }))
  it.prop('∀c_AllocatedBackordered_=Requested', [PlaceOrderCommand], ([command]) =>
    Result.match(placeOrder(command), {
      onFailure: (error) => refusalExplained(command, error),
      onSuccess: (decision) =>
        Match.value(decision).pipe(
          Match.tag('OrderHeld', () => creditPredictedOf(command) === 'held'),
          Match.tag('OrderAllocated', (allocated) => matchesDemanded(command, allocated.reservations, [])),
          Match.tag('OrderAllocatedWithOverdraft', (allocated) => matchesDemanded(command, allocated.reservations, [])),
          Match.tag(
            'OrderBackordered',
            (backordered) => matchesDemanded(command, backordered.reservations, backordered.backordered),
          ),
          Match.exhaustive,
        ),
    }))

  it.prop('∀c_Allocation_⊆Live', [PlaceOrderCommand], ([command]) =>
    Result.match(placeOrder(command), {
      onFailure: (error) => refusalExplained(command, error),
      onSuccess: (decision) =>
        Match.value(decision).pipe(
          Match.tag('OrderHeld', () => true),
          Match.tag('OrderAllocated', (allocated) => everyReservationLive(command, allocated.reservations)),
          Match.tag(
            'OrderAllocatedWithOverdraft',
            (allocated) => everyReservationLive(command, allocated.reservations),
          ),
          Match.tag('OrderBackordered', (backordered) => everyReservationLive(command, backordered.reservations)),
          Match.exhaustive,
        ),
    }))
})
