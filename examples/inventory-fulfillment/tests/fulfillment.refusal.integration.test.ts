import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment } from '@systemfsoftware/example-inventory-fulfillment'
import { Contract } from '@systemfsoftware/trace-spec'
import { Effect } from 'effect'
import { allocateContract, placeOrderRequest, settlementLayers } from './__fixtures__/fulfillment-trace.fixture.js'

const Feature = makeFeature({ it })

Feature('Refusing an order whose trace breaks the written contract', { timeout: 120_000 })
  .withScenarioLayer(settlementLayers)
  .live('the order runs through in-process PGlite, whose file reads the simulation kernel cannot observe')
  .body(({ scenario }) => {
    scenario(
      'A held order held to the contract that requires the charge names the charge',
      Gherkin.Do.pipe(
        Given('an order a customer without credit cannot pay for')(
          'order',
          () => Effect.succeed(placeOrderRequest('held-order', 'customer-without-credit')),
        ),
        When('the order is held to the contract that requires the charge')(
          'judgment',
          (s) => Contract.judge(allocateContract, s.order),
        ),
        Then('the refusal names the charge that never arrived')((s, expect) =>
          expect(s.judgment.verdict).toMatchObject({
            _tag: 'Break',
            conjunct: `unique(${Fulfillment.Taxonomy.CreditCharge.id})`,
          })
        ),
      ),
    )
  })
