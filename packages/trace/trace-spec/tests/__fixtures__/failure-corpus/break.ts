import { Contract, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Span } from '@systemfsoftware/trace-taxonomy'
import type { RecordedRun } from '@systemfsoftware/vitest/failure'
import { Effect, FileSystem, Layer } from 'effect'
import { Charge, FulfillmentTaxonomy, Settle } from '../fulfillment-trace.fixture.js'
import type { CorpusFixture } from './record.js'

export const defectFile = 'packages/trace/trace-spec/tests/__fixtures__/failure-corpus/break.ts'

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

const recordSettleAndOrphanCharge = Stimulus.make({
  name: 'fulfillment.settle',
  run: ({ input }: { readonly input: { readonly orderId: string } }) =>
    Effect.gen(function*() {
      yield* Span.start(Settle, { 'app.order.id': input.orderId, 'app.order.total': 1 })(Effect.void)
      yield* Span.start(Charge, { 'app.order.id': 'order-8', 'app.order.total': 2 })(Effect.void)
      return input.orderId
    }),
})

const chargeBeneathSettlement = Contract.of(FulfillmentTaxonomy)
  .stimulate(recordSettleAndOrphanCharge)
  .holds(Rel.all(Rel.exists(Settle), Rel.child(Settle, Charge)))

const services = Layer.merge(ObservationWindow.make('trace-spec').layer, memoryTraceFileSystem)

const program: RecordedRun<void, Contract.JudgeFailure<never>> = (checks) =>
  Contract.check(chargeBeneathSettlement, checks.expect, { orderId: 'order-7' }).pipe(Effect.provide(services))

export const traceBreak: CorpusFixture<Contract.JudgeFailure<never>> = {
  name: 'a trace break',
  defectFile,
  raisingFile: defectFile,
  program,
}
