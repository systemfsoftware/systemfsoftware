import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Inventory } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Layer } from 'effect'
import {
  drizzleLedgerLayer,
  landTwoCharges,
  ledgerSpec,
  liveSessionLayer,
  memoryLedgerLayer,
} from './__fixtures__/credit-ledger.fixture.js'

const Feature = makeFeature({ it })

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
        Then('every charge shows up in the balance the account answers with')((s, expect) =>
          expect({ report: s.checked }).toMatchObject({
            report: { _tag: 'Pass', histories: expect.schemaMatching(Inventory.Schema.Quantity) },
          })
        ),
      ),
    )

    scenario(
      'Two orders that charge one account in Postgres both land',
      Gherkin.Do.pipe(
        Given('a Postgres ledger holding two customers with clean accounts')(
          'session',
          () => Effect.succeed(liveSessionLayer),
        ),
        When('two orders charge the same account as their calls interleave')(
          'landed',
          (s) =>
            Effect.scoped(
              Effect.flatMap(Layer.build(s.session), (session) =>
                landTwoCharges({
                  commands: [
                    { _tag: 'Charge', customer: 'ada', amount: 1 },
                    { _tag: 'Charge', customer: 'ada', amount: 2 },
                  ],
                  customer: 'ada',
                }).pipe(Effect.provide(drizzleLedgerLayer(session)))),
            ),
        ),
        Then('every charge shows up in the balance the account answers with')((s, expect) =>
          expect({ balance: s.landed.balance, latestCommit: Math.max(...s.landed.charges) }).toEqual({
            balance: 3,
            latestCommit: 3,
          })
        ),
      ),
    )
  })
