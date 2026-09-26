import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Persistence, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Context, Effect, Fiber, Layer, Ref, Result, type Scope } from 'effect'
import {
  type LawCase,
  settlementStopLaws,
  type SettlementStopSubject,
} from './__fixtures__/settlement-stop-laws.fixture.js'
import {
  FIRST_CUSTOMER,
  FIRST_LOT,
  FIRST_SKU,
  keyOf,
  type OrderInput,
  planOf,
  reservationsOf,
  resetPostgres,
  settlementStoreWorld,
  standardBudget,
} from './__fixtures__/settlement-store.fixture.js'

const Feature = makeFeature({ it })

const ORDER: OrderInput = {
  orderId: 'order-stop-laws',
  customerId: FIRST_CUSTOMER,
  sku: FIRST_SKU,
  lotId: FIRST_LOT,
  quantity: 3,
  charge: 9,
}

const realSubject: Effect.Effect<SettlementStopSubject, never, Scope.Scope> = Effect.gen(function*() {
  const context = yield* Layer.build(
    Layer.provideMerge(Settlement.Drizzle.layer(standardBudget), settlementStoreWorld),
  )
  const store = Context.get(context, Settlement.Store.SettlementStore)
  const db = Context.get(context, Persistence.DrizzleSession.DrizzleSession)
  const captured = yield* Ref.make<Settlement.Unit.SettlementUnit | undefined>(undefined)
  const through = <A, E>(
    body: Effect.Effect<A, E, Settlement.Store.SettlementStore | Persistence.DrizzleSession.DrizzleSession>,
  ) => Effect.provide(body, context)
  return {
    prepare: through(resetPostgres),
    unitOfWork: (use) => store.unitOfWork((unit) => Effect.andThen(Ref.set(captured, unit), use(unit))),
    key: keyOf(ORDER),
    plan: planOf(ORDER),
    captured: Ref.get(captured),
    settledCount: reservationsOf(db, ORDER.orderId),
    kill: (fiber) => Effect.asVoid(Fiber.interrupt(fiber)),
    release: () => Effect.void,
  }
})

const [ordinaryRun, stoppedAtAnyStep, keptAfterStop, killedMidCall] = settlementStopLaws(realSubject)

const verdictOf = (law: LawCase): Effect.Effect<string> =>
  Effect.map(
    Effect.result(law.check),
    (outcome) =>
      Result.match(outcome, {
        onFailure: (failure) => `${law.name}: broken — ${failure.message}`,
        onSuccess: () => 'holds',
      }),
  )

const lawPipeline = (event: string, law: LawCase) =>
  Gherkin.Do.pipe(
    When(event)('verdict', () => verdictOf(law)),
    Then('the law holds for the real settlement store')((state, expect) => expect(state.verdict).toEqual('holds')),
  )

Feature('The real settlement store obeys the settlement stop laws over PGlite', { timeout: 0 })
  .live('the laws run the store transactions through PGlite, whose engine a kernel run cannot drive')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An ordinary unit of work reads its order and settles it exactly once',
      lawPipeline('an order is read and settled through one unit of work', ordinaryRun),
    )

    scenario(
      'A unit stopped at any step writes nothing and keeps its unit closed',
      lawPipeline('the same order is stopped at every step of its unit of work', stoppedAtAnyStep),
    )

    scenario(
      'A unit kept after its stop cannot read or settle again',
      lawPipeline('a caller keeps the unit of work a stop ended and reaches for it again', keptAfterStop),
    )

    scenario(
      'A unit killed mid-call writes nothing and the next unit of work still commits',
      lawPipeline('a unit of work is killed while its call is in flight', killedMidCall),
    )
  })
