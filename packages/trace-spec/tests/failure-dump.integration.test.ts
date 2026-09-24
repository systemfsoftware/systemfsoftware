import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contract, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer } from 'effect'
import * as PlatformError from 'effect/PlatformError'
import { Charge, FulfillmentTaxonomy, Settle } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it })

const memoryTraceFileSystem = Layer.effect(
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

interface Refusal {
  readonly verdict: Rel.Verdict
  readonly dumpPath: string
  readonly traceId: string
  readonly dump: string
}

type Order = { readonly orderId: string }

const recordSettleAndOrphanCharge = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: Order }) =>
    Effect.gen(function*() {
      yield* Span.start(Settle, { 'app.order.id': input.orderId, 'app.order.total': 1 })(Effect.void)
      yield* Span.start(Charge, { 'app.order.id': 'order-8', 'app.order.total': 2 })(Effect.void)
      return input.orderId
    }),
})

const refusalOf = (
  judgment: Contract.Judgment<Order, string>,
): Effect.Effect<Refusal, PlatformError.PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dumpPath = judgment.dumpPath ?? ''
    const dump = dumpPath === '' ? '' : yield* fs.readFileString(dumpPath)
    return { verdict: judgment.verdict, dumpPath, traceId: judgment.run.traceId, dump }
  })

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(recordSettleAndOrphanCharge)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

Feature('A failed trace contract')
  .withScenarioLayer(Layer.merge(ObservationWindow.make('trace-spec').layer, memoryTraceFileSystem))
  .body(({ scenario }) => {
    scenario(
      'A charge recorded outside its settlement parent is written down',
      Gherkin.Do.pipe(
        Given('an order whose settlement recorded a charge outside its parent')(
          'order',
          () => Effect.succeed({ orderId: 'order-7' }),
        ),
        When('the settlement is held to the contract')(
          'judgment',
          (s) => Contract.judge(chargeBeneathSettlement, s.order),
        ),
        Then('the refusal names the parent it inspected, the trace it wrote and both recorded spans')((s, expect) =>
          Effect.map(refusalOf(s.judgment), (refusal) =>
            expect(refusal).toMatchObject({
              verdict: {
                _tag: 'Break',
                conjunct: `child(${Settle.id},${Charge.id})`,
                inspected: [expect.any(String), expect.any(String)],
              },
              traceId: s.judgment.run.traceId,
              dumpPath: expect.stringMatching(
                new RegExp(`artifacts/traces/.*${s.judgment.run.traceId}`),
              ),
              dump: expect.stringMatching(
                new RegExp(`${s.judgment.run.traceId}[\\s\\S]*${Settle.name}[\\s\\S]*${Charge.name}`),
              ),
            }))
        ),
      ),
    )
  })
