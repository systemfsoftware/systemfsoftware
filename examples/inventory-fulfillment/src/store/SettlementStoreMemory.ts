import { Array as Arr, Effect, HashMap, Option, Record as Record_, Ref } from 'effect'
import type { CustomerTier } from '../fulfillment/credit.schema.js'
import { CreditAccountNotFound } from '../fulfillment/decision.schema.js'
import type {
  SettlementCharge,
  SettlementCommand,
  SettlementOutcome,
  SettlementStoreSeed,
  SettlementStoreService,
} from '../ports/SettlementStore.js'
import { decodeCreditAccount, decodeCustomerTier, decodeWarehouseStockPartition } from './decode.js'
import { type ClaimedLot, claimedLots, creditObservation, mintCreditProof, mintStockProof } from './SettlementProof.js'

interface CustomerState {
  readonly tier: string
  readonly creditLimit: number
  readonly outstandingBalance: number
  readonly overdraftPrivilege: number
  readonly version: number
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
}

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
      version: 1,
    } satisfies CustomerState,
  ])),
})

const readCredit = (state: Ref.Ref<MemoryState>, customerId: string) =>
  Effect.gen(function*() {
    const current = yield* Ref.get(state)
    return yield* Option.match(HashMap.get(current.customers, customerId), {
      onNone: () =>
        Effect.fail(new CreditAccountNotFound({ customerId, reason: `no credit account for customer ${customerId}` })),
      onSome: (customer) =>
        Effect.gen(function*() {
          const account = yield* decodeCreditAccount({
            customerId,
            creditLimit: customer.creditLimit,
            outstandingBalance: customer.outstandingBalance,
            overdraftPrivilege: customer.overdraftPrivilege,
          })
          const tier: CustomerTier = yield* decodeCustomerTier(customer.tier)
          return { account, tier, proof: mintCreditProof({ customerId, version: customer.version }) }
        }),
    })
  })

const readAllStock = (state: Ref.Ref<MemoryState>) =>
  Effect.gen(function*() {
    const current = yield* Ref.get(state)
    const entries = HashMap.toEntries(current.lots)
    const partitions = yield* Effect.forEach(
      Record_.toEntries(Arr.groupBy(entries, ([, lot]) => lot.warehouseId)),
      ([warehouseId, group]) =>
        decodeWarehouseStockPartition({
          warehouseId,
          region: Option.getOrThrow(HashMap.get(current.warehouses, warehouseId)),
          lots: Arr.map(group, ([lotId, lot]) => ({
            lotId,
            sku: lot.sku,
            warehouseId,
            quantityOnHand: lot.quantityOnHand,
            version: lot.version,
            expiresAt: null,
          })),
        }),
    )
    return {
      partitions,
      proof: mintStockProof(Record_.fromIterableWith(entries, ([lotId, lot]) => [lotId, lot.version])),
    }
  })

const matchesCharge = (customer: CustomerState, customerId: string, charge: SettlementCharge): boolean => {
  const observed = creditObservation(charge.proof)
  return observed.customerId === customerId && customer.version === observed.version
}

const chargeCustomer = (
  customers: HashMap.HashMap<string, CustomerState>,
  customerId: string,
  charge: SettlementCharge,
): Option.Option<HashMap.HashMap<string, CustomerState>> =>
  Option.flatMap(HashMap.get(customers, customerId), (customer) => {
    const drawable = matchesCharge(customer, customerId, charge)
    return drawable
      ? Option.some(HashMap.set(customers, customerId, {
        ...customer,
        outstandingBalance: customer.outstandingBalance + charge.amount,
        version: customer.version + 1,
      }))
      : Option.none()
  })

const chargeLeg = (current: MemoryState, command: SettlementCommand): Option.Option<MemoryState> =>
  Option.match(command.charge, {
    onNone: () => Option.some(current),
    onSome: (charge) =>
      Option.map(
        chargeCustomer(current.customers, command.customerId, charge),
        (customers) => ({ ...current, customers }),
      ),
  })

const claimLot = (
  lots: HashMap.HashMap<string, LotState>,
  claim: ClaimedLot,
): Option.Option<readonly [string, LotState]> =>
  Option.map(
    Option.flatMap(HashMap.get(lots, claim.lotId), (lot) =>
      lot.version === claim.observedVersion
        ? Option.some({
          ...lot,
          quantityOnHand: lot.quantityOnHand - claim.quantity,
          version: claim.observedVersion + 1,
        })
        : Option.none()),
    (lot) => [claim.lotId, lot] as const,
  )

const stockLeg = (current: MemoryState, claims: readonly ClaimedLot[]): Option.Option<MemoryState> =>
  Option.map(
    Option.all(Arr.map(claims, (claim) => claimLot(current.lots, claim))),
    (pairs) => ({
      ...current,
      lots: Arr.reduce(pairs, current.lots, (lots, pair) => HashMap.set(lots, pair[0], pair[1])),
    }),
  )

const settle = (state: Ref.Ref<MemoryState>, command: SettlementCommand): Effect.Effect<SettlementOutcome> =>
  Option.match(claimedLots(command), {
    onNone: () => Effect.succeed('Conflict'),
    onSome: (claims) =>
      Ref.modify(state, (current) =>
        Option.flatMap(chargeLeg(current, command), (next) => stockLeg(next, claims)).pipe(
          Option.match({
            onNone: () => ['Conflict', current] as const,
            onSome: (next) => ['Committed', next] as const,
          }),
        )),
  })

export const make = (seed: SettlementStoreSeed): Effect.Effect<SettlementStoreService> =>
  Effect.gen(function*() {
    const state = yield* Ref.make(initialStateOf(seed))
    return {
      readCredit: (customerId: string) => readCredit(state, customerId),
      readAllStock: readAllStock(state).pipe(Effect.orDie),
      settle: (command: SettlementCommand) => settle(state, command),
    }
  })
