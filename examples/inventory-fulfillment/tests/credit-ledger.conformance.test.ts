import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Persistence } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Layer } from 'effect'
import { passedRuns } from './__fixtures__/conformance-report.fixture.js'
import {
  drizzleLedgerLayer,
  ledgerSequenceSpec,
  ledgerSpec,
  memoryLedgerLayer,
} from './__fixtures__/credit-ledger.fixture.js'

const Feature = makeFeature({ it })

const sessionLayer = Persistence.DrizzleSession.layerTest.pipe(
  Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)),
)

Feature('Charging one customer from two orders at once', { timeout: 120_000 })
  .withLayer(Layer.empty)
  .live('the scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Two orders that charge one account in memory both land',
      Gherkin.Do.pipe(
        Given('an in-memory ledger holding two customers with clean accounts')(
          'ledger',
          () => Effect.succeed(memoryLedgerLayer),
        ),
        When('two orders charge the same account as their calls interleave')(
          'checked',
          (s) => Conformance.linearizable(s.ledger, ledgerSpec),
        ),
        Then('every charge shows up in the balance the account answers with')((s) => {
          passedRuns(s.checked)
        }),
      ),
    )

    scenario(
      'Two orders that charge one account in Postgres both land',
      Gherkin.Do.pipe(
        Given('a Postgres ledger holding two customers with clean accounts')(
          'session',
          () => Effect.succeed(sessionLayer),
        ),
        When('two orders charge the same account as their calls interleave')(
          'checked',
          (s) =>
            Effect.scoped(
              Effect.flatMap(Layer.build(s.session), (session) =>
                Conformance.sequential(drizzleLedgerLayer(session), ledgerSequenceSpec)),
            ),
        ),
        Then('every charge shows up in the balance the account answers with')((s) => {
          passedRuns(s.checked)
        }),
      ),
    )
  })
