import { And, But, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Exit, Layer, Ref } from 'effect'
import { expect } from 'vitest'
import { InsufficientFundsError, OutOfStockError } from './__fixtures__/OrderFulfillment.schema.js'

interface WalletService {
  readonly balance: Effect.Effect<number>
  readonly debit: (amount: number) => Effect.Effect<number, InsufficientFundsError>
}

class Wallet extends Context.Service<Wallet, WalletService>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/Wallet',
) {}

interface InventoryService {
  readonly stock: (sku: string) => Effect.Effect<number>
  readonly reserve: (sku: string, qty: number) => Effect.Effect<void, OutOfStockError>
  readonly release: (sku: string, qty: number) => Effect.Effect<void>
}

class Inventory extends Context.Service<Inventory, InventoryService>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/Inventory',
) {}

interface OrderAuditService {
  readonly record: (event: string) => Effect.Effect<void>
  readonly history: Effect.Effect<readonly string[]>
}

class OrderAudit extends Context.Service<OrderAudit, OrderAuditService>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/OrderAudit',
) {}

const makeOrderFulfillmentLayer = (initialBalance: number, initialStock: number) =>
  Layer.mergeAll(
    Layer.effect(
      Wallet,
      Effect.gen(function*() {
        const funds = yield* Ref.make(initialBalance)
        return {
          balance: Ref.get(funds),
          debit: (amount: number) =>
            Ref.get(funds).pipe(
              Effect.flatMap((current) => {
                if (current < amount) {
                  return Effect.fail(new InsufficientFundsError({ required: amount, available: current }))
                }
                return Ref.set(funds, current - amount).pipe(Effect.as(current - amount))
              }),
            ),
        }
      }),
    ),
    Layer.effect(
      Inventory,
      Effect.gen(function*() {
        const items = yield* Ref.make(initialStock)
        return {
          stock: (_sku: string) => Ref.get(items),
          reserve: (sku: string, qty: number) =>
            Ref.get(items).pipe(
              Effect.flatMap((current) => {
                if (current < qty) {
                  return Effect.fail(new OutOfStockError({ sku }))
                }
                return Ref.set(items, current - qty).pipe(Effect.asVoid)
              }),
            ),
          release: (_sku: string, qty: number) => Ref.update(items, (current) => current + qty),
        }
      }),
    ),
    Layer.effect(
      OrderAudit,
      Effect.gen(function*() {
        const events = yield* Ref.make<readonly string[]>([])
        return {
          record: (event: string) => Ref.update(events, (all) => [...all, event]),
          history: Ref.get(events),
        }
      }),
    ),
  )

const Feature = makeFeature({ it, layer })

Feature('Order fulfillment and wallet debiting')
  .withScenarioLayer(makeOrderFulfillmentLayer(100, 5))
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A customer with sufficient balance and available inventory successfully places an order',
      Gherkin.Do.pipe(
        Given('an active customer wallet with 100 dollars')('wallet', () => Wallet),
        Given('an inventory repository with 5 units of widgets')('inventory', () => Inventory),
        Given('an order audit journal')('audit', () => OrderAudit),
        When('the customer purchases 2 widgets costing 30 dollars each')(
          'purchaseResult',
          (s) =>
            Effect.gen(function*() {
              yield* s.inventory.reserve('widget', 2)
              const remaining = yield* s.wallet.debit(60)
              yield* s.audit.record('order_completed:widget:2')
              return { remaining }
            }),
        ),
        Then('the customer wallet is debited leaving the expected balance')((s) =>
          Effect.gen(function*() {
            expect(s.purchaseResult.remaining).toBe(40)
            const liveBalance = yield* s.wallet.balance
            expect(liveBalance).toBe(40)
          })
        ),
        And('the reserved stock is deducted from the inventory')((s) =>
          Effect.gen(function*() {
            const liveStock = yield* s.inventory.stock('widget')
            expect(liveStock).toBe(3)
          })
        ),
        And('the transaction is permanently recorded in the order audit journal')((s) =>
          Effect.gen(function*() {
            const events = yield* s.audit.history
            expect(events).toEqual(['order_completed:widget:2'])
          })
        ),
      ),
    )

    scenarioOutline(
      'Evaluating checkout outcomes for price <price> and quantity <qty> resulting in <expected>',
      [
        { price: 50, qty: 1, expected: 'success', remainingBalance: 50, remainingStock: 4 },
        { price: 150, qty: 1, expected: 'insufficient_funds', remainingBalance: 100, remainingStock: 5 },
        { price: 20, qty: 10, expected: 'out_of_stock', remainingBalance: 100, remainingStock: 5 },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('the order fulfillment services are initialized')('services', () =>
            Effect.gen(function*() {
              const wallet = yield* Wallet
              const inventory = yield* Inventory
              const audit = yield* OrderAudit
              return { wallet, inventory, audit }
            })),
          When('checkout is requested for the specified cart')('outcome', (s) =>
            Effect.gen(function*() {
              const attempt = Effect.acquireUseRelease(
                s.services.inventory.reserve('widget', row.qty),
                () =>
                  Effect.gen(function*() {
                    yield* s.services.wallet.debit(row.price)
                    yield* s.services.audit.record(`purchased:${row.qty}`)
                    return 'success'
                  }),
                (_res, exit) => {
                  if (Exit.isSuccess(exit)) {
                    return Effect.void
                  }
                  return s.services.inventory.release('widget', row.qty)
                },
              )

              return yield* attempt.pipe(
                Effect.catchTags({
                  InsufficientFundsError: () => Effect.succeed('insufficient_funds'),
                  OutOfStockError: () => Effect.succeed('out_of_stock'),
                }),
              )
            })),
          Then('the checkout outcome matches expectation')((s) => {
            expect(s.outcome).toBe(row.expected)
          }),
          And('the wallet balance remains consistent with the outcome')((s) =>
            Effect.gen(function*() {
              const bal = yield* s.services.wallet.balance
              expect(bal).toBe(row.remainingBalance)
            })
          ),
          But('the inventory stock is only reduced when checkout succeeds')((s) =>
            Effect.gen(function*() {
              const stk = yield* s.services.inventory.stock('widget')
              expect(stk).toBe(row.remainingStock)
            })
          ),
        ),
    )
  })
