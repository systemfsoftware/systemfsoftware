import {
  Array as Arr,
  Context,
  Effect,
  Exit,
  HashMap,
  Layer,
  Match,
  Option,
  Record as Record_,
  Ref,
  Semaphore,
} from 'effect'
import type { CreditAccount, CustomerTier } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound, StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { InventoryReservationEvents } from '../fulfillment/event.schema.js'
import type { LotAllocation, WarehouseStockPartition } from '../inventory/inventory.schema.js'
import type { OrderKey, OrderPlan } from '../ports/SettlementStore.service.js'
import { SettlementStore, type SettlementStoreSeed, UnitOfWork } from '../ports/SettlementStore.service.js'
import { decodeCreditAccount, decodeCustomerTier, decodeWarehouseStockPartition } from './decode.js'

interface CustomerState {
  readonly tier: string
  readonly creditLimit: number
  readonly outstandingBalance: number
  readonly overdraftPrivilege: number
}

interface LotState {
  readonly sku: string
  readonly warehouseId: string
  readonly quantityOnHand: number
  readonly version: number
}

interface MemoryState {
  readonly warehouses: HashMap.HashMap<string, string>
  readonly lots: HashMap.HashMap<string, LotState>
  readonly customers: HashMap.HashMap<string, CustomerState>
  readonly reservations: HashMap.HashMap<string, string>
  readonly audits: HashMap.HashMap<string, string>
}

class OpenTransaction extends Context.Service<OpenTransaction, Ref.Ref<MemoryState>>()(
  '@systemfsoftware/example-inventory-fulfillment/store/SettlementStoreMemory/OpenTransaction',
) {}

const unitProvidedElsewhere = new Error(
  'UnitOfWork was provided by something other than SettlementStore.unitOfWork',
)

const inTransaction = <A, E>(
  use: (staged: Ref.Ref<MemoryState>) => Effect.Effect<A, E>,
): Effect.Effect<A, E, UnitOfWork> =>
  Effect.gen(function*() {
    yield* UnitOfWork
    return yield* Effect.flatMap(
      Effect.serviceOption(OpenTransaction),
      Option.match({ onNone: () => Effect.die(unitProvidedElsewhere), onSome: use }),
    )
  })

const initialStateOf = (seed: SettlementStoreSeed): MemoryState => ({
  warehouses: HashMap.fromIterable(
    Arr.map(seed.warehouses, (warehouse) => [warehouse.warehouseId, warehouse.region] as const),
  ),
  lots: HashMap.fromIterable(Arr.map(seed.lots, (lot) => [
    lot.lotId,
    {
      sku: lot.sku,
      warehouseId: lot.warehouseId,
      quantityOnHand: lot.quantityOnHand,
      version: lot.version,
    } satisfies LotState,
  ])),
  customers: HashMap.fromIterable(Arr.map(seed.customers, (customer) => [
    customer.customerId,
    {
      tier: customer.tier,
      creditLimit: customer.creditLimit,
      outstandingBalance: customer.outstandingBalance,
      overdraftPrivilege: customer.overdraftPrivilege,
    } satisfies CustomerState,
  ])),
  reservations: HashMap.empty(),
  audits: HashMap.empty(),
})

const observedCustomer = (
  customerId: string,
  customer: CustomerState,
): Effect.Effect<{ readonly account: CreditAccount; readonly tier: CustomerTier }, StoreUnavailable> =>
  Effect.gen(function*() {
    const account = yield* decodeCreditAccount({
      customerId,
      creditLimit: customer.creditLimit,
      outstandingBalance: customer.outstandingBalance,
      overdraftPrivilege: customer.overdraftPrivilege,
    })
    const tier: CustomerTier = yield* decodeCustomerTier(customer.tier)
    return { account, tier }
  }).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

const ofSkus = (skus: readonly string[]) => (entry: readonly [string, LotState]): boolean =>
  Arr.contains(skus, entry[1].sku)

const partitionsOf = (
  current: MemoryState,
  skus: readonly string[],
): Effect.Effect<readonly WarehouseStockPartition[], StoreUnavailable> =>
  Effect.forEach(
    Record_.toEntries(Arr.groupBy(
      Arr.filter(HashMap.toEntries(current.lots), ofSkus(skus)),
      ([, lot]) => lot.warehouseId,
    )),
    ([warehouseId, group]) =>
      decodeWarehouseStockPartition({
        warehouseId,
        region: Option.getOrElse(HashMap.get(current.warehouses, warehouseId), () => ''),
        lots: Arr.map(group, ([lotId, lot]) => ({
          lotId,
          sku: lot.sku,
          warehouseId,
          quantityOnHand: lot.quantityOnHand,
          version: lot.version,
          expiresAt: null,
        })),
      }),
  ).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

const load = (staged: Ref.Ref<MemoryState>, key: OrderKey) =>
  Effect.gen(function*() {
    const current = yield* Ref.get(staged)
    const customer = yield* Effect.fromOption(
      HashMap.get(current.customers, key.customerId),
      () =>
        new CreditAccountNotFound({
          customerId: key.customerId,
          reason: `no credit account for customer ${key.customerId}`,
        }),
    )
    const observed = yield* observedCustomer(key.customerId, customer)
    const stock = yield* partitionsOf(current, key.skus)
    return {
      ...observed,
      stock,
      reservedBy: Option.map(
        HashMap.get(current.reservations, key.orderId),
        (owner) => owner,
      ),
    }
  })

const allocationsOf = (events: readonly InventoryReservationEvents[]): readonly LotAllocation[] =>
  Arr.flatMap(events, (event) =>
    Match.value(event).pipe(
      Match.tag('StockReserved', ({ allocations }) => allocations),
      Match.tag('BackorderRecorded', () => Arr.empty()),
      Match.exhaustive,
    ))

const auditIdOf = (plan: OrderPlan): string => `${plan.orderId}:audit`

const customersOf = (current: MemoryState, plan: OrderPlan) =>
  Option.match(plan.charge, {
    onNone: () => current.customers,
    onSome: (amount) =>
      HashMap.modify(current.customers, plan.customerId, (customer) => ({
        ...customer,
        outstandingBalance: customer.outstandingBalance + amount,
      })),
  })

const lotsOf = (
  lots: HashMap.HashMap<string, LotState>,
  allocations: readonly LotAllocation[],
): HashMap.HashMap<string, LotState> =>
  Arr.reduce(allocations, lots, (next, allocation) =>
    HashMap.modify(next, allocation.lotId, (lot) => ({
      ...lot,
      quantityOnHand: lot.quantityOnHand - allocation.quantity,
    })))

const reservationsOf = (current: MemoryState, plan: OrderPlan, allocations: readonly LotAllocation[]) =>
  Arr.isReadonlyArrayEmpty(allocations)
    ? current.reservations
    : HashMap.set(current.reservations, plan.orderId, plan.customerId)

const appliedPlan = (current: MemoryState, plan: OrderPlan): MemoryState => {
  const allocations = allocationsOf(plan.events)
  return {
    ...current,
    customers: customersOf(current, plan),
    lots: lotsOf(current.lots, allocations),
    reservations: reservationsOf(current, plan, allocations),
    audits: HashMap.set(current.audits, auditIdOf(plan), plan.audit.decisionTag),
  }
}

const duplicateSettle = (orderId: string): StoreUnavailable =>
  new StoreUnavailable({ cause: `a settle for order ${orderId} already committed` })

const shortLot = (
  lots: HashMap.HashMap<string, LotState>,
  allocations: readonly LotAllocation[],
): boolean =>
  Arr.some(allocations, (allocation) =>
    Option.match(HashMap.get(lots, allocation.lotId), {
      onNone: () => true,
      onSome: (lot) => lot.quantityOnHand - allocation.quantity < 0,
    }))

const outOfStock = (plan: OrderPlan): StoreUnavailable =>
  new StoreUnavailable({ cause: `no stock left to settle order ${plan.orderId}` })

const settleIn = (current: MemoryState, plan: OrderPlan): Effect.Effect<MemoryState, StoreUnavailable> =>
  Match.value(current).pipe(
    Match.when(
      (state) => HashMap.has(state.audits, auditIdOf(plan)),
      () => Effect.fail(duplicateSettle(plan.orderId)),
    ),
    Match.when(
      (state) => shortLot(state.lots, allocationsOf(plan.events)),
      () => Effect.fail(outOfStock(plan)),
    ),
    Match.orElse((state) => Effect.succeed(appliedPlan(state, plan))),
  )

const settle = (staged: Ref.Ref<MemoryState>, plan: OrderPlan): Effect.Effect<void, StoreUnavailable> =>
  Effect.flatMap(Ref.get(staged), (current) => Effect.flatMap(settleIn(current, plan), (next) => Ref.set(staged, next)))

const make = (seed: SettlementStoreSeed) =>
  Effect.gen(function*() {
    const state = yield* Ref.make(initialStateOf(seed))
    const gate = yield* Semaphore.make(1)
    return {
      load: (key: OrderKey) => inTransaction((staged) => load(staged, key)),
      settle: (plan: OrderPlan) => inTransaction((staged) => settle(staged, plan)),
      unitOfWork: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        gate.withPermits(1)(
          Effect.gen(function*() {
            const staged = yield* Ref.make(yield* Ref.get(state))
            const exit = yield* Effect.exit(
              effect.pipe(
                Effect.provideService(UnitOfWork, { open: true }),
                Effect.provideService(OpenTransaction, staged),
              ),
            )
            if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
            yield* Ref.set(state, yield* Ref.get(staged))
            return exit.value
          }),
        ),
    }
  })

export const layer = (seed: SettlementStoreSeed): Layer.Layer<SettlementStore> =>
  Layer.effect(SettlementStore, make(seed))
