import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { gateLayer, gateResponse, passedHistories } from './__fixtures__/customer-gate.js'
import { GateCommand, gateModel } from './__fixtures__/customer-gate.model.js'

const Feature = makeFeature({ it })

Feature("Serving one customer's orders one at a time", { timeout: 0 })
  .withLayer(Layer.empty)
  .live('the scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Two orders for the same customer never overlap, however their calls interleave',
      Gherkin.Do.pipe(
        Given('a fresh checkout with no orders placed yet')('checkout', () => Effect.succeed(gateLayer)),
        When('Ada and Bo each place a short order, trying every order their calls can take')(
          'report',
          (s) =>
            Conformance.linearizable(s.checkout, {
              commands: GateCommand,
              model: gateModel,
              run: gateResponse,
              fibers: 2,
              operations: 4,
              preemptions: 2,
              maxSchedules: 200_000,
            }),
        ),
        Then("every order finds its own customer's line empty when it enters")((s) => {
          passedHistories(s.report)
        }),
      ),
    )
  })
