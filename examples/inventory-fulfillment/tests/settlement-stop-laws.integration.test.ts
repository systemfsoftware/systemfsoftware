import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Fiber, Layer, Result, type Scope } from 'effect'
import {
  type LawCase,
  settlementStopLaws,
  type SettlementStopSubject,
} from './__fixtures__/settlement-stop-laws.fixture.js'
import { keyOf, type OrderInput, planOf } from './__fixtures__/settlement-store.fixture.js'
import { driverOf, freshOrderWorld, type OrderWorld } from './__fixtures__/stop-obligations.js'

const Feature = makeFeature({ it })

const ORDER: OrderInput = {
  orderId: 'order-stop-laws',
  customerId: 'customer-1',
  sku: 'sku-1',
  lotId: 'lot-1',
  quantity: 2,
  charge: 9,
}

const KEY = keyOf(ORDER)
const PLAN = planOf(ORDER)

const abandonMidCall: SettlementStopSubject['kill'] = () => Effect.void

const letTheRunGo: SettlementStopSubject['release'] = (fiber) => Effect.asVoid(Fiber.interrupt(fiber))

const fakeSubject = (world: OrderWorld): SettlementStopSubject => ({
  prepare: Effect.sync(() => {
    world.settled.length = 0
    world.reserved.clear()
    world.opened = undefined
  }),
  unitOfWork: (use) =>
    Effect.scoped(
      Effect.flatMap(
        Settlement.Unit.open(driverOf(world)),
        (unit) =>
          Effect.andThen(
            Effect.sync(() => {
              world.opened = unit
            }),
            use(unit),
          ),
      ),
    ),
  key: KEY,
  plan: PLAN,
  captured: Effect.sync(() => world.opened),
  settledCount: Effect.sync(() => world.settled.filter((settled) => settled === KEY.orderId).length),
  kill: abandonMidCall,
  release: letTheRunGo,
})

const fakeSubjects: Effect.Effect<SettlementStopSubject, never, Scope.Scope> = Effect.map(
  Effect.sync(freshOrderWorld),
  fakeSubject,
)

const [ordinaryRun, stoppedAtAnyStep, keptAfterStop, killedMidCall] = settlementStopLaws(fakeSubjects)

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
    Then('the law holds for the fake settlement driver')((state, expect) => expect(state.verdict).toEqual('holds')),
  )

Feature('The fake settlement driver obeys the settlement stop laws')
  .live('the laws fork a run, park it mid-call and interrupt it, which a kernel run cannot observe')
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
