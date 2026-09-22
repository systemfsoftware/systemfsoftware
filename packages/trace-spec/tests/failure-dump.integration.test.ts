import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { FailureDump, Graph, Rel, Verdict } from '@systemfsoftware/trace-spec'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import { expect } from 'vitest'
import { Charge, FulfillmentTaxonomy, Settle, spanRecord, TRACE_ID } from './__fixtures__/fulfillment-trace.schema.js'

const Feature = makeFeature({ it, layer })

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

const breakOf = (verdict: Verdict.Verdict): Verdict.Break => {
  if (!Schema.is(Verdict.Break)(verdict)) throw new Error('expected the recorded relation to break')
  return verdict
}

Feature('A failed trace contract')
  .withScenarioLayer(memoryTraceFileSystem)
  .body(({ scenario }) => {
    scenario(
      'A charge is recorded without its settlement parent',
      Gherkin.Do.pipe(
        Given('a finished trace recorded a charge without its settlement parent')(
          'observed',
          () =>
            Graph.decode(
              TRACE_ID,
              [
                spanRecord({
                  spanId: 'settle-1',
                  name: Settle.name,
                  parentSpanId: null,
                  status: 'ok',
                  attributes: { 'app.order.id': 'order-7', 'app.order.total': 1 },
                }),
                spanRecord({
                  spanId: 'charge-1',
                  name: Charge.name,
                  parentSpanId: null,
                  status: 'ok',
                  attributes: { 'app.order.id': 'order-8', 'app.order.total': 2 },
                }),
              ],
              FulfillmentTaxonomy,
            ),
        ),
        When('the failing relation is written down')(
          'failure',
          (s) =>
            Effect.gen(function*() {
              const breach = breakOf(Rel.child(Settle, Charge).evaluate(s.observed))
              return yield* FailureDump.disparity({
                graph: s.observed,
                relation: Rel.child(Settle, Charge),
                break: breach,
              })
            }),
        ),
        Then('the failure names where the decoded trace was written')((s) => {
          expect(s.failure.relationId).toContain('child(fulfillment.settle')
          expect(s.failure.breaks).toHaveLength(1)
          expect(s.failure.breaks[0]?.inspected).toContain('charge-1')
          expect(s.failure.dumpPath).toContain('artifacts/traces/')
          expect(s.failure.dumpPath).toContain(TRACE_ID)
        }),
        And('the written trace names both recorded spans')((s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const dump = s.failure.dumpPath === null ? '' : yield* fs.readFileString(s.failure.dumpPath)
            expect(dump).toContain('fulfillment.settle')
            expect(dump).toContain('credit.charge')
            expect(dump).toContain('settle-1')
            expect(dump).toContain('charge-1')
          })
        ),
      ),
    )
  })
