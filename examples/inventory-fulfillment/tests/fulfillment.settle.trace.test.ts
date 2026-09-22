import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment } from '@systemfsoftware/example-inventory-fulfillment'
import { Contract } from '@systemfsoftware/trace-spec'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import {
  allocateContract,
  creditHoldContract,
  disparityOf,
  settlementLayers,
  settlementRequest,
} from './__fixtures__/fulfillment-trace.fixture.js'

const Feature = makeFeature({ it, layer })

const world = settlementLayers({
  creditLimits: { 'customer-in-good-standing': 1000, 'customer-without-credit': 0 },
  commitOutcomes: { 'contested-order': 'VersionConflict' },
})

Feature('Settling an order under a written contract over its trace')
  .withScenarioLayer(world)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'An order the customer can pay for is settled and charged',
      Gherkin.Do.pipe(
        Given('an order for two units of a stocked line, with credit available')(
          'order',
          () => Effect.succeed(settlementRequest('order-1', 'customer-in-good-standing')),
        ),
        When('the settlement is held to the contract that requires the charge')(
          'checked',
          (s) => Contract.check(allocateContract, s.order),
        ),
        Then('the settlement is accepted, with the reservation and the charge recorded beneath it')((s) => {
          expect(Result.isSuccess(s.checked.run.output)).toBe(true)
          expect(s.checked.graph.byId(Fulfillment.ReservationCommit)).toHaveLength(1)
          expect(s.checked.graph.byId(Fulfillment.CreditCharge)).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'An order the credit cannot cover is held without a charge',
      Gherkin.Do.pipe(
        Given('an order for two units of a stocked line, with no credit available')(
          'order',
          () => Effect.succeed(settlementRequest('order-2', 'customer-without-credit')),
        ),
        When('the settlement is held to the contract that allows no charge on a hold')(
          'checked',
          (s) => Contract.check(creditHoldContract, s.order),
        ),
        Then('the settlement is accepted and no charge is recorded')((s) => {
          expect(Result.isSuccess(s.checked.run.output)).toBe(true)
          expect(s.checked.graph.byId(Fulfillment.ReservationCommit)).toHaveLength(1)
          expect(s.checked.graph.byId(Fulfillment.CreditCharge)).toHaveLength(0)
        }),
      ),
    )

    scenario(
      'An order whose reservation another settlement already took is refused by the contract',
      Gherkin.Do.pipe(
        Given(
          'an order for two units of a stocked line, with credit available, against a reservation that has moved on',
        )(
          'order',
          () => Effect.succeed(settlementRequest('contested-order', 'customer-in-good-standing')),
        ),
        When('the settlement is held to the contract that requires the charge')(
          'refusal',
          (s) => Effect.flip(Contract.check(allocateContract, s.order)),
        ),
        Then('the refusal names the charge that never happened and where the trace was written')((s) => {
          const refusal = disparityOf(s.refusal)
          expect(refusal.breaks.map((entry) => entry.conjunct)).toContain(`exists(${Fulfillment.CreditCharge.id})`)
          expect(refusal.dumpPath).toContain('artifacts/traces/')
        }),
      ),
    )
  })
