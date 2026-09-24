import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { passedRuns } from './__fixtures__/conformance-report.fixture.js'
import {
  inventoryReadLayer,
  inventoryReadSpec,
  reservationReadLayer,
  reservationReadSpec,
} from './__fixtures__/store-reads.fixture.js'

const Feature = makeFeature({ it })

Feature('Reading the in-memory stores')
  .withLayer(Layer.empty)
  .live('the scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Walking the in-memory catalogue reaches every lot in a stable order',
      Gherkin.Do.pipe(
        Given('an in-memory catalogue holding two warehouses stocked with five lots')(
          'store',
          () => Effect.succeed(inventoryReadLayer),
        ),
        When('the whole catalogue and each warehouse are walked, one page at a time')(
          'checked',
          (s) => Conformance.sequential(s.store, inventoryReadSpec),
        ),
        Then('every lot comes back in sku then lot order, each exactly once')((s) => {
          passedRuns(s.checked)
        }),
      ),
    )

    scenario(
      'Looking up an in-memory reservation returns what the order was written with',
      Gherkin.Do.pipe(
        Given('an in-memory log holding reservations for two orders')(
          'store',
          () => Effect.succeed(reservationReadLayer),
        ),
        When('each order is looked up, including one the log never held')(
          'checked',
          (s) => Conformance.sequential(s.store, reservationReadSpec),
        ),
        Then("each lookup answers with that order's own allocations, or nothing")((s) => {
          passedRuns(s.checked)
        }),
      ),
    )
  })
