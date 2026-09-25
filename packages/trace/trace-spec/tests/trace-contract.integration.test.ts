import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contract, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer } from 'effect'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it })

const recordingFileSystem = Layer.effect(
  FileSystem.FileSystem,
  Effect.sync(() => {
    const files = new Map<string, string>()
    return FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path, data) =>
        Effect.sync(() => {
          files.set(path, data)
        }),
      readFileString: (path) => Effect.succeed(files.get(path) ?? ''),
    })
  }),
)

type Order = { readonly orderId: string; readonly charge: boolean }

const settleOrder = (order: Order) => {
  const attrs = { 'app.order.id': order.orderId, 'app.order.total': 9 }
  const settled = Effect.succeed(`settled:${order.orderId}`)
  return Span.start(Settle, attrs)(order.charge ? Span.start(Charge, attrs)(settled) : settled)
}

const settlement = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: Order }) => settleOrder(input),
})

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

Feature('Settling an order under a contract that names the charge')
  .withScenarioLayer(Layer.merge(ObservationWindow.make('trace-spec').layer, recordingFileSystem))
  .body(({ scenario }) => {
    scenario(
      'A settlement that charges credit satisfies the contract',
      Gherkin.Do.pipe(
        Given('an order whose settlement charges credit')(
          'order',
          () => Effect.succeed({ orderId: 'order-11', charge: true }),
        ),
        When('the settlement is held to the contract')(
          'checked',
          (s) => Contract.judge(chargeBeneathSettlement, s.order),
        ),
        Then('the settlement is accepted and its charge is on the same trace')((s, expect) =>
          expect({ output: s.checked.run.output, verdict: s.checked.verdict }).toMatchObject({
            output: 'settled:order-11',
            verdict: { _tag: 'Hold', conjunct: chargeBeneathSettlement.relation.id },
          })
        ),
      ),
    )

    scenario(
      'A settlement that quietly skips the charge is refused',
      Gherkin.Do.pipe(
        Given('an order whose settlement never charges credit')(
          'order',
          () => Effect.succeed({ orderId: 'order-12', charge: false }),
        ),
        When('the settlement is held to the contract')(
          'judgment',
          (s) => Contract.judge(chargeBeneathSettlement, s.order),
        ),
        Then('the refusal names the missing charge and where the trace was written')((s, expect) =>
          expect({ verdict: s.judgment.verdict, dumpPath: s.judgment.dumpPath }).toMatchObject({
            verdict: { _tag: 'Break', conjunct: `child(${Settle.id},${Charge.id})` },
            dumpPath: expect.stringContaining('artifacts/traces/'),
          })
        ),
      ),
    )
  })
