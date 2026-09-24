import { expect } from '@effect/vitest'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Inventory } from '@systemfsoftware/example-inventory-fulfillment'
import { DateTime, Effect, Encoding, Result, Schema as S } from 'effect'
import {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  CreditHold,
  DuplicateOrder,
  Forbidden,
  InsufficientStock,
  StoreUnavailable,
  submitRequest,
  TestServer,
  TestServerLayer,
  Unauthorized,
  uniqueEmail,
  uniqueId,
  uniquePassword,
} from './__fixtures__/server.fixture.js'
import type {
  Client,
  CreditInput,
  FulfillmentDecision,
  Session,
  StockLotInput,
  StockView,
} from './__fixtures__/server.fixture.js'

const Feature = makeFeature({ it })

interface LineInput {
  readonly sku: string
  readonly quantity: number
}

const registerCustomer = (name: string): Effect.Effect<Session, never, TestServer> =>
  Effect.gen(function*() {
    const server = yield* TestServer
    const email = uniqueEmail()
    const password = uniquePassword()
    yield* server.signUp(email, password, name)
    return yield* server.signIn(email, password)
  })

const registerCustomerWithCredit = (
  name: string,
  credit: Omit<CreditInput, 'userId'>,
): Effect.Effect<Session, never, TestServer> =>
  Effect.gen(function*() {
    const server = yield* TestServer
    const session = yield* registerCustomer(name)
    yield* server.seed.credit({ userId: session.userId, ...credit })
    return session
  })

const provisionStock = (
  warehouseId: string,
  region: string,
  lots: readonly StockLotInput[],
): Effect.Effect<void, never, TestServer> =>
  Effect.gen(function*() {
    const server = yield* TestServer
    yield* server.seed.warehouse(warehouseId, region)
    yield* Effect.forEach(lots, (lot) => server.seed.stockLot(lot), { discard: true })
  })

const placeOrder = (session: Session, orderId: string, lines: readonly LineInput[]) =>
  Effect.gen(function*() {
    const server = yield* TestServer
    const client = yield* server.client(session.cookie)
    const payload = yield* submitRequest({ orderId, lines })
    return yield* client.submitOrder(payload)
  })

type CreditOutcome =
  | { readonly tag: 'AllocatedSplit'; readonly orderId: string }
  | {
    readonly tag: 'CreditHold'
    readonly orderId: string
    readonly shortfall: number
    readonly requiredDownpayment: number
  }

type CreditHoldOutcome = Extract<CreditOutcome, { readonly tag: 'CreditHold' }>

const classifyCreditOutcome = (decision: FulfillmentDecision): Effect.Effect<CreditOutcome> =>
  S.decodeUnknownEffect(AllocatedSplit)(decision).pipe(
    Effect.map((allocated): CreditOutcome => ({ tag: 'AllocatedSplit', orderId: allocated.orderId })),
    Effect.catchTag('SchemaError', () =>
      S.decodeUnknownEffect(CreditHold)(decision).pipe(
        Effect.map(
          (held): CreditOutcome => ({
            tag: 'CreditHold',
            orderId: held.orderId,
            shortfall: held.shortfall,
            requiredDownpayment: held.requiredDownpayment,
          }),
        ),
        Effect.orDie,
      )),
  )

const lotIdsOf = (view: StockView): readonly string[] =>
  view.partitions.flatMap((partition) => partition.lots.map((lot) => lot.lotId))

interface StockPageRequest {
  readonly warehouseId: string
  readonly limit: number
  readonly cursor?: Inventory.Schema.StockPosition | undefined
}

const positionOf = (token: string): Inventory.Schema.StockPosition =>
  Result.getOrThrow(S.decodeResult(Inventory.Schema.StockCursor)(token))

const listStockPage = (session: Session, request: StockPageRequest) =>
  Effect.gen(function*() {
    const server = yield* TestServer
    const client = yield* server.client(session.cookie)
    return yield* client.listStock(request)
  })

Feature('Inventory fulfillment across the warehouse network', { timeout: 120_000 })
  .withScenarioLayer(TestServerLayer)
  .live('customers drive the store through a real HTTP socket held together with an in-process PGlite ledger')
  .body(({ scenario }) => {
    scenario(
      'An order larger than one warehouse is split across two warehouses',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Split Shipment', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('two warehouses whose combined stock covers the order')('catalog', () =>
          Effect.gen(function*() {
            const skuA = uniqueId('sku-a')
            const skuB = uniqueId('sku-b')
            const east = uniqueId('warehouse-east')
            const west = uniqueId('warehouse-west')
            yield* provisionStock(east, 'east', [{
              id: uniqueId('lot'),
              sku: skuA,
              warehouseId: east,
              quantity: 6,
              expiresAt: DateTime.makeUnsafe('2027-01-01T00:00:00Z'),
            }])
            yield* provisionStock(west, 'west', [
              {
                id: uniqueId('lot'),
                sku: skuA,
                warehouseId: west,
                quantity: 8,
                expiresAt: DateTime.makeUnsafe('2027-02-01T00:00:00Z'),
              },
              { id: uniqueId('lot'), sku: skuB, warehouseId: west, quantity: 5 },
            ])
            return { skuA, skuB, east, west }
          })),
        When('the customer orders ten units of the first item and five of the second')(
          'decision',
          (s) =>
            placeOrder(s.customer, uniqueId('order'), [
              { sku: s.catalog.skuA, quantity: 10 },
              { sku: s.catalog.skuB, quantity: 5 },
            ]),
        ),
        Then('the fulfillment routes six units from the first warehouse and four from the second')(
          (s) =>
            Effect.gen(function*() {
              const split = yield* S.decodeUnknownEffect(AllocatedSplit)(s.decision)
              expect(
                split.allocations.map((allocation) => ({
                  warehouseId: allocation.warehouseId,
                  sku: allocation.sku,
                  quantity: allocation.quantity,
                })),
              ).toEqual([
                { warehouseId: s.catalog.east, sku: s.catalog.skuA, quantity: 6 },
                { warehouseId: s.catalog.west, sku: s.catalog.skuA, quantity: 4 },
                { warehouseId: s.catalog.west, sku: s.catalog.skuB, quantity: 5 },
              ])
            }),
        ),
      ),
    )

    scenario(
      'An order one warehouse can cover is fulfilled from that warehouse alone',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Full Allocation', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('a warehouse holding seven units of a single item')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 7 }])
            return { sku, warehouse, lot }
          })),
        When('the customer orders all seven units')(
          'decision',
          (s) => placeOrder(s.customer, uniqueId('order'), [{ sku: s.catalog.sku, quantity: 7 }]),
        ),
        Then('the whole order is reserved from that warehouse')(
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const split = yield* S.decodeUnknownEffect(AllocatedSplit)(s.decision)
              expect(
                split.allocations.map((allocation) => ({
                  warehouseId: allocation.warehouseId,
                  quantity: allocation.quantity,
                })),
              ).toEqual([{ warehouseId: s.catalog.warehouse, quantity: 7 }])
              expect((yield* server.inspect.stock(s.catalog.lot)).quantityOnHand).toBe(0)
            }),
        ),
      ),
    )

    scenario(
      'An order larger than available stock reserves what exists and backorders the rest',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Backorder', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('a warehouse holding three units of a single item')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 3 }])
            return { sku, lot }
          })),
        When('the customer orders five units')('outcome', (s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            const orderId = uniqueId('order')
            const decision = yield* placeOrder(s.customer, orderId, [{ sku: s.catalog.sku, quantity: 5 }])
            return { decision, reservations: yield* server.inspect.reservations(orderId) }
          })),
        Then('three units are reserved without a charge, and two are recorded as backordered')(
          (s) =>
            Effect.gen(function*() {
              const backordered = yield* S.decodeUnknownEffect(Backordered)(s.outcome.decision)
              expect(backordered.allocations.map((allocation) => allocation.quantity)).toEqual([3])
              expect(
                backordered.backorderedLines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
              ).toEqual([{ sku: s.catalog.sku, quantity: 2 }])
              expect(s.outcome.reservations.map((row) => row.quantity)).toEqual([3])
              const server = yield* TestServer
              expect((yield* server.inspect.credit(s.customer.userId)).outstandingBalance).toBe(0)
            }),
        ),
      ),
    )

    scenario(
      'A Standard customer over the credit limit is held for a downpayment',
      Gherkin.Do.pipe(
        Given('a Standard customer with a small credit limit')(
          'customer',
          () =>
            registerCustomerWithCredit('Credit Hold', { tier: 'Standard', creditLimit: 100, overdraftPrivilege: 0 }),
        ),
        Given('a warehouse holding enough units for a large order')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 600 }])
            return { sku, lot }
          })),
        When('the customer orders beyond their limit')(
          'decision',
          (s) => placeOrder(s.customer, uniqueId('order'), [{ sku: s.catalog.sku, quantity: 600 }]),
        ),
        Then('the order is held for a five hundred unit downpayment and no stock is reserved')(
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const held = yield* S.decodeUnknownEffect(CreditHold)(s.decision)
              expect(held.shortfall).toBe(500)
              expect(held.requiredDownpayment).toBe(500)
              expect((yield* server.inspect.stock(s.catalog.lot)).quantityOnHand).toBe(600)
            }),
        ),
      ),
    )

    scenario(
      'A VIP customer overdrafting within privilege has the order fulfilled',
      Gherkin.Do.pipe(
        Given('a VIP customer with a pre-authorized overdraft privilege')(
          'customer',
          () =>
            registerCustomerWithCredit('VIP Overdraft', { tier: 'VIP', creditLimit: 100, overdraftPrivilege: 1000 }),
        ),
        Given('a warehouse holding enough units for a large order')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 600 }])
            return { sku, lot }
          })),
        When('the customer orders beyond their limit')(
          'decision',
          (s) => placeOrder(s.customer, uniqueId('order'), [{ sku: s.catalog.sku, quantity: 600 }]),
        ),
        Then('the order is allocated and the overdraft is recorded')(
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const overdraft = yield* S.decodeUnknownEffect(AllocatedWithOverdraft)(s.decision)
              expect(overdraft.overdraftAmount).toBe(500)
              expect(overdraft.allocations.map((allocation) => allocation.quantity)).toEqual([600])
              expect((yield* server.inspect.stock(s.catalog.lot)).quantityOnHand).toBe(0)
            }),
        ),
      ),
    )

    scenario(
      'An order for an item no warehouse stocks is refused',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Absent Stock', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('an item that no warehouse stocks')('catalog', () => Effect.succeed({ sku: uniqueId('sku') })),
        When('the customer orders four units')('refusal', (s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            const client = yield* server.client(s.customer.cookie)
            const payload = yield* submitRequest({
              orderId: uniqueId('order'),
              lines: [{ sku: s.catalog.sku, quantity: 4 }],
            })
            return yield* Effect.flip(client.submitOrder(payload))
          })),
        Then('the refusal names the item and the missing quantity')(
          (s) =>
            Effect.gen(function*() {
              const insufficient = yield* S.decodeUnknownEffect(InsufficientStock)(s.refusal)
              expect(insufficient.sku).toBe(s.catalog.sku)
              expect(insufficient.requested).toBe(4)
              expect(insufficient.available).toBe(0)
            }),
        ),
      ),
    )

    scenario(
      'Two customers racing for the last unit leave exactly one fulfilled',
      Gherkin.Do.pipe(
        Given('two customers with Standard accounts and ample credit')('customers', () =>
          Effect.gen(function*() {
            const first = yield* registerCustomerWithCredit('Race First', { tier: 'Standard', creditLimit: 1000 })
            const second = yield* registerCustomerWithCredit('Race Second', { tier: 'Standard', creditLimit: 1000 })
            return { first, second }
          })),
        Given('a warehouse holding exactly one unit')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 1 }])
            return { sku, lot }
          })),
        When('both customers order the last unit at once')(
          'tags',
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const firstClient = yield* server.client(s.customers.first.cookie)
              const secondClient = yield* server.client(s.customers.second.cookie)
              const firstPayload = yield* submitRequest({
                orderId: uniqueId('order'),
                lines: [{ sku: s.catalog.sku, quantity: 1 }],
              })
              const secondPayload = yield* submitRequest({
                orderId: uniqueId('order'),
                lines: [{ sku: s.catalog.sku, quantity: 1 }],
              })
              const [contested, sibling] = yield* Effect.all(
                [
                  Effect.result(firstClient.submitOrder(firstPayload)),
                  Effect.result(secondClient.submitOrder(secondPayload)),
                ],
                { concurrency: 'unbounded' },
              )
              return yield* Effect.forEach([contested, sibling], (result) =>
                Result.match(result, {
                  onFailure: (error) =>
                    S.decodeUnknownEffect(InsufficientStock)(error).pipe(Effect.as('InsufficientStock')),
                  onSuccess: (decision) =>
                    S.decodeUnknownEffect(AllocatedSplit)(decision).pipe(Effect.as('AllocatedSplit')),
                }))
            }),
        ),
        Then('exactly one order is fulfilled and stock never goes negative')(
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              expect(s.tags.filter((tag) => tag === 'AllocatedSplit')).toHaveLength(1)
              expect(s.tags.filter((tag) => tag === 'InsufficientStock')).toHaveLength(1)
              expect((yield* server.inspect.stock(s.catalog.lot)).quantityOnHand).toBe(0)
            }),
        ),
      ),
    )

    scenario(
      'An order whose first commit attempt fails is retried and still fulfills the order',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Retry Success', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('a warehouse holding five units')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 5 }])
            return { sku, lot }
          })),
        When('the first commit attempt raises a serialization failure')('outcome', (s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            yield* server.seam.armOnce
            const orderId = uniqueId('order')
            const decision = yield* placeOrder(s.customer, orderId, [{ sku: s.catalog.sku, quantity: 2 }])
            return { decision, orderId }
          })),
        Then('the retry fulfills the order, charges once, and reserves the stock')(
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const split = yield* S.decodeUnknownEffect(AllocatedSplit)(s.outcome.decision)
              expect(split.allocations.map((allocation) => allocation.quantity)).toEqual([2])
              expect((yield* server.inspect.stock(s.catalog.lot)).quantityOnHand).toBe(3)
              expect((yield* server.inspect.reservations(s.outcome.orderId)).map((row) => row.quantity)).toEqual([2])
              expect((yield* server.inspect.credit(s.customer.userId)).outstandingBalance).toBe(2)
              expect(yield* server.inspect.auditTags(s.outcome.orderId)).toHaveLength(1)
            }),
        ),
      ),
    )

    scenario(
      'An order that keeps failing to commit is refused and inventory is untouched',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Retry Exhaustion', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('a warehouse holding five units')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lot = uniqueId('lot')
            yield* provisionStock(warehouse, 'central', [{ id: lot, sku, warehouseId: warehouse, quantity: 5 }])
            return { sku, lot }
          })),
        When('every commit attempt raises a serialization failure')('outcome', (s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            const orderId = uniqueId('order')
            yield* server.seam.armAlways
            const failure = yield* Effect.ensuring(
              Effect.flip(
                placeOrder(s.customer, orderId, [{ sku: s.catalog.sku, quantity: 2 }]),
              ),
              server.seam.disarm,
            )
            return { orderId, failure }
          })),
        Then('the order is refused as unavailable and nothing is written')(
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              expect(s.outcome.failure).toSatisfy(S.is(StoreUnavailable))
              expect((yield* server.inspect.stock(s.catalog.lot)).quantityOnHand).toBe(5)
              expect(yield* server.inspect.reservations(s.outcome.orderId)).toHaveLength(0)
              expect(yield* server.inspect.auditTags(s.outcome.orderId)).toHaveLength(0)
              expect((yield* server.inspect.credit(s.customer.userId)).outstandingBalance).toBe(0)
            }),
        ),
      ),
    )

    scenario(
      'One customer cannot read another customer reservation',
      Gherkin.Do.pipe(
        Given('two customers with Standard accounts and ample credit')('customers', () =>
          Effect.gen(function*() {
            const owner = yield* registerCustomerWithCredit('Reservation Owner', {
              tier: 'Standard',
              creditLimit: 1000,
            })
            const other = yield* registerCustomerWithCredit('Reservation Other', {
              tier: 'Standard',
              creditLimit: 1000,
            })
            return { owner, other }
          })),
        Given('a warehouse stocking an item for both customers')('context', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            yield* provisionStock(warehouse, 'central', [{
              id: uniqueId('lot'),
              sku,
              warehouseId: warehouse,
              quantity: 5,
            }])
            return { sku }
          })),
        When('each customer places an order and the second reads the first reservation')(
          'attempts',
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const ownerOrder = uniqueId('order')
              const otherOrder = uniqueId('order')
              yield* placeOrder(s.customers.owner, ownerOrder, [{ sku: s.context.sku, quantity: 1 }])
              yield* placeOrder(s.customers.other, otherOrder, [{ sku: s.context.sku, quantity: 1 }])
              const otherClient = yield* server.client(s.customers.other.cookie)
              const anonymousClient = yield* server.client()
              const anonymousPayload = yield* submitRequest({
                orderId: uniqueId('order'),
                lines: [{ sku: s.context.sku, quantity: 1 }],
              })
              return {
                ownerOrder,
                otherOrder,
                owned: yield* otherClient.getReservation({ orderId: otherOrder }),
                crossCaller: yield* Effect.flip(otherClient.getReservation({ orderId: ownerOrder })),
                anonymous: yield* Effect.flip(anonymousClient.submitOrder(anonymousPayload)),
              }
            }),
        ),
        Then('the cross-caller read and the anonymous order are both denied')(
          (s) =>
            Effect.gen(function*() {
              const forbidden = yield* S.decodeUnknownEffect(Forbidden)(s.attempts.crossCaller)
              expect(forbidden.resource).toBe(s.attempts.ownerOrder)
              const unauthorized = yield* S.decodeUnknownEffect(Unauthorized)(s.attempts.anonymous)
              expect(unauthorized._tag).toBe('Unauthorized')
            }),
        ),
        And('each customer still reads their own reservation')(
          (s) => {
            expect(s.attempts.owned.customerId).toBe(s.customers.other.userId)
            expect(s.attempts.owned.orderId).toBe(s.attempts.otherOrder)
          },
        ),
      ),
    )

    scenario(
      'An already fulfilled order cannot be submitted a second time',
      Gherkin.Do.pipe(
        Given('a customer with a Standard account and ample credit')(
          'customer',
          () => registerCustomerWithCredit('Repeat Submission', { tier: 'Standard', creditLimit: 1000 }),
        ),
        Given('a warehouse holding five units')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            yield* provisionStock(warehouse, 'central', [{
              id: uniqueId('lot'),
              sku,
              warehouseId: warehouse,
              quantity: 5,
            }])
            return { sku }
          })),
        When('the customer fulfills an order')(
          'order',
          (s) =>
            Effect.gen(function*() {
              const orderId = uniqueId('order')
              const outcome = yield* placeOrder(s.customer, orderId, [{ sku: s.catalog.sku, quantity: 2 }])
              return { orderId, outcome }
            }),
        ),
        When('the same order is submitted again')(
          'resubmission',
          (s) =>
            Effect.gen(function*() {
              const refusal = yield* Effect.flip(
                placeOrder(s.customer, s.order.orderId, [{ sku: s.catalog.sku, quantity: 2 }]),
              )
              return yield* S.decodeUnknownEffect(DuplicateOrder)(refusal)
            }),
        ),
        And('the original reservation is the only one recorded')((s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            expect(yield* server.inspect.reservations(s.order.orderId)).toHaveLength(1)
          })
        ),
      ),
    )

    scenario(
      'Another caller naming a fulfilled order is refused',
      Gherkin.Do.pipe(
        Given('two customers with Standard accounts and ample credit')('customers', () =>
          Effect.gen(function*() {
            const owner = yield* registerCustomerWithCredit('Duplicate Owner', {
              tier: 'Standard',
              creditLimit: 1000,
            })
            const other = yield* registerCustomerWithCredit('Duplicate Other', {
              tier: 'Standard',
              creditLimit: 1000,
            })
            return { owner, other }
          })),
        Given('a warehouse holding five units')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            yield* provisionStock(warehouse, 'central', [{
              id: uniqueId('lot'),
              sku,
              warehouseId: warehouse,
              quantity: 5,
            }])
            return { sku }
          })),
        When('the first customer fulfills an order')(
          'order',
          (s) =>
            Effect.gen(function*() {
              const orderId = uniqueId('order')
              yield* placeOrder(s.customers.owner, orderId, [{ sku: s.catalog.sku, quantity: 2 }])
              return { orderId }
            }),
        ),
        When('the second customer submits the same order')(
          'refusal',
          (s) =>
            Effect.gen(function*() {
              const refusal = yield* Effect.flip(
                placeOrder(s.customers.other, s.order.orderId, [{ sku: s.catalog.sku, quantity: 2 }]),
              )
              return yield* S.decodeUnknownEffect(Forbidden)(refusal)
            }),
        ),
        Then('the refusal names the order and the other customer is charged nothing')((s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            expect(s.refusal.resource).toBe(s.order.orderId)
            expect(yield* server.inspect.reservations(s.order.orderId)).toHaveLength(1)
            expect(yield* server.inspect.auditTags(s.order.orderId)).toHaveLength(1)
            expect((yield* server.inspect.credit(s.customers.other.userId)).outstandingBalance).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'A customer paging through the stock list reaches every lot',
      Gherkin.Do.pipe(
        Given('a customer with an authenticated session')('customer', () => registerCustomer('Stock Pager')),
        Given('a warehouse stocking five lots of a single item')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            const lots = [uniqueId('lot'), uniqueId('lot'), uniqueId('lot'), uniqueId('lot'), uniqueId('lot')]
            yield* provisionStock(
              warehouse,
              'central',
              lots.map((id) => ({ id, sku, warehouseId: warehouse, quantity: 1 })),
            )
            return { sku, warehouse, lots }
          })),
        When('they list the stock four lots at a time')('pages', (s) =>
          Effect.gen(function*() {
            const first = yield* listStockPage(s.customer, { warehouseId: s.catalog.warehouse, limit: 4 })
            const second = yield* listStockPage(s.customer, {
              warehouseId: s.catalog.warehouse,
              limit: 4,
              cursor: first.nextCursor === null ? undefined : positionOf(first.nextCursor),
            })
            return { first, second }
          })),
        Then('the first page holds four lots and offers a way to continue')((s) => {
          expect(lotIdsOf(s.pages.first)).toHaveLength(4)
          expect(s.pages.first.nextCursor).toBeTypeOf('string')
        }),
        And('the next page holds the one remaining lot and closes the listing')((s) => {
          const firstIds = lotIdsOf(s.pages.first)
          const secondIds = lotIdsOf(s.pages.second)
          expect(secondIds).toHaveLength(1)
          expect([...secondIds, ...firstIds].sort()).toEqual([...s.catalog.lots].sort())
          expect(s.pages.second.nextCursor).toBeNull()
        }),
      ),
    )

    scenario(
      'A stock page key nobody issued is refused while the real listing still closes',
      Gherkin.Do.pipe(
        Given('a customer with an authenticated session')('customer', () => registerCustomer('Page Key Refusal')),
        Given('a warehouse stocking five lots of a single item')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            yield* provisionStock(
              warehouse,
              'central',
              [uniqueId('lot'), uniqueId('lot'), uniqueId('lot'), uniqueId('lot'), uniqueId('lot')].map((id) => ({
                id,
                sku,
                warehouseId: warehouse,
                quantity: 1,
              })),
            )
            return { warehouse }
          })),
        When('they ask for the next page with a page key nobody issued')('refusal', (s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            return yield* server.postRpc(
              'listStock',
              {
                warehouseId: s.catalog.warehouse,
                limit: 4,
                cursor: Encoding.encodeBase64('no-separator'),
              },
              s.customer.cookie,
            )
          })),
        Then('the refusal names the page key and never blames the store')((s) => {
          expect(s.refusal).toHaveLength(1)
          const defect = s.refusal[0]?.exit.cause[0]?.defect ?? ''
          expect(defect).toContain('JSON string')
          expect(defect).toContain('cursor')
          expect(defect).not.toContain('StoreUnavailable')
        }),
        And('the listing itself still pages through every lot and closes')((s) =>
          Effect.gen(function*() {
            const first = yield* listStockPage(s.customer, { warehouseId: s.catalog.warehouse, limit: 4 })
            const second = yield* listStockPage(s.customer, {
              warehouseId: s.catalog.warehouse,
              limit: 4,
              cursor: first.nextCursor === null ? undefined : positionOf(first.nextCursor),
            })
            expect(lotIdsOf(first)).toHaveLength(4)
            expect(lotIdsOf(second)).toHaveLength(1)
            expect(second.nextCursor).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Two orders a customer submits at once cannot both draw on the same credit',
      Gherkin.Do.pipe(
        Given('a Standard customer with a hundred unit credit limit')(
          'customer',
          () => registerCustomerWithCredit('Credit Single Flight', { tier: 'Standard', creditLimit: 100 }),
        ),
        Given('a warehouse holding ample stock of one item across two lots')('catalog', () =>
          Effect.gen(function*() {
            const sku = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            yield* provisionStock(warehouse, 'central', [
              { id: uniqueId('lot'), sku, warehouseId: warehouse, quantity: 200 },
              { id: uniqueId('lot'), sku, warehouseId: warehouse, quantity: 200 },
            ])
            return { sku }
          })),
        When('both orders draw on the account at once')(
          'outcomes',
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const firstClient = yield* server.client(s.customer.cookie)
              const secondClient = yield* server.client(s.customer.cookie)
              const firstPayload = yield* submitRequest({
                orderId: uniqueId('order'),
                lines: [{ sku: s.catalog.sku, quantity: 80 }],
              })
              const secondPayload = yield* submitRequest({
                orderId: uniqueId('order'),
                lines: [{ sku: s.catalog.sku, quantity: 80 }],
              })
              const [contested, sibling] = yield* Effect.all(
                [
                  firstClient.submitOrder(firstPayload),
                  secondClient.submitOrder(secondPayload),
                ],
                { concurrency: 'unbounded' },
              )
              return yield* Effect.forEach([contested, sibling], classifyCreditOutcome)
            }),
        ),
        Then('exactly one order is allocated and the other is held for the shortfall')((s) => {
          expect(s.outcomes.filter((outcome) => outcome.tag === 'AllocatedSplit')).toHaveLength(1)
          const held = s.outcomes.filter(
            (outcome): outcome is CreditHoldOutcome => outcome.tag === 'CreditHold',
          )
          expect(held).toHaveLength(1)
          expect(held[0]?.shortfall).toBe(60)
          expect(held[0]?.requiredDownpayment).toBe(60)
        }),
      ),
    )

    scenario(
      'Two orders for different products that read the account together never overdraw it',
      Gherkin.Do.pipe(
        Given('a Standard customer with a sixty unit credit limit and no overdraft')(
          'customer',
          () => registerCustomerWithCredit('Credit Write Skew', { tier: 'Standard', creditLimit: 60 }),
        ),
        Given('a warehouse stocking two different products, forty units each')('catalog', () =>
          Effect.gen(function*() {
            const first = uniqueId('sku')
            const second = uniqueId('sku')
            const warehouse = uniqueId('warehouse')
            yield* provisionStock(warehouse, 'central', [
              { id: uniqueId('lot'), sku: first, warehouseId: warehouse, quantity: 40 },
              { id: uniqueId('lot'), sku: second, warehouseId: warehouse, quantity: 40 },
            ])
            return { first, second }
          })),
        When('both orders are placed at once while the account can only cover one')(
          'outcomes',
          (s) =>
            Effect.gen(function*() {
              const server = yield* TestServer
              const firstClient = yield* server.client(s.customer.cookie)
              const secondClient = yield* server.client(s.customer.cookie)
              const attempt = (client: Client, sku: string) =>
                Effect.gen(function*() {
                  const payload = yield* submitRequest({
                    orderId: uniqueId('order'),
                    lines: [{ sku, quantity: 40 }],
                  })
                  return yield* client.submitOrder(payload)
                })
              const [contested, sibling] = yield* Effect.all(
                [attempt(firstClient, s.catalog.first), attempt(secondClient, s.catalog.second)],
                { concurrency: 'unbounded' },
              )
              return yield* Effect.forEach([contested, sibling], classifyCreditOutcome)
            }),
        ),
        Then('the customer never owes more than the credit allows')((s) =>
          Effect.gen(function*() {
            const server = yield* TestServer
            const credit = yield* server.inspect.credit(s.customer.userId)
            expect(credit.outstandingBalance).toBeLessThanOrEqual(credit.creditLimit + credit.overdraftPrivilege)
          })
        ),
        And('one order is fulfilled and the other is held for credit')((s) => {
          expect(s.outcomes.filter((outcome) => outcome.tag === 'AllocatedSplit')).toHaveLength(1)
          const held = s.outcomes.filter(
            (outcome): outcome is CreditHoldOutcome => outcome.tag === 'CreditHold',
          )
          expect(held).toHaveLength(1)
          expect(held[0]?.shortfall).toBe(20)
          expect(held[0]?.requiredDownpayment).toBe(20)
        }),
      ),
    )
  })
