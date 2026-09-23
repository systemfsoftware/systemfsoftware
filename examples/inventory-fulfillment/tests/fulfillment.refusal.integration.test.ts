import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment } from '@systemfsoftware/example-inventory-fulfillment'
import { Contract } from '@systemfsoftware/trace-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import {
  allocateContract,
  contestedSettlementLayers,
  disparityOf,
  settlementRequest,
} from './__fixtures__/fulfillment-trace.fixture.js'

const Feature = makeFeature({ it, layer })

const world = contestedSettlementLayers

Feature('Refusing a settlement whose trace breaks the written contract')
  .withScenarioLayer(world)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A settlement whose reservation was already taken names the charge that never arrived',
      Gherkin.Do.pipe(
        Given('an order whose reservation moved on after it was read')(
          'order',
          () => Effect.succeed(settlementRequest('contested-order', 'customer-in-good-standing')),
        ),
        When('the settlement is held to the contract that requires the charge')(
          'refusal',
          (s) => Effect.flip(Contract.check(allocateContract, s.order)),
        ),
        Then('the refusal names the charge that never arrived and where the trace was written')((s) => {
          const refusal = disparityOf(s.refusal)
          expect(refusal.breaks.map((entry) => entry.conjunct)).toContain(`exists(${Fulfillment.CreditCharge.id})`)
          expect(refusal.dumpPath).toContain('artifacts/traces/')
        }),
      ),
    )
  })
