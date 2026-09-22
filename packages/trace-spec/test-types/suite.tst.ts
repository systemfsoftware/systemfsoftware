import { Contract, type Observe, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Context, Effect, type FileSystem, type Layer, Schema } from 'effect'
import { describe, expect, it } from 'tstyche'

class Inventory extends Context.Service<Inventory, { readonly count: Effect.Effect<number> }>()('test/Inventory') {}

declare const bindings: Parameters<typeof Suite.make>[0]
declare const harness: Layer.Layer<Observe.Observation | FileSystem.FileSystem>
declare const harnessWithInventory: Layer.Layer<Observe.Observation | FileSystem.FileSystem | Inventory>
declare const fileSystemOnly: Layer.Layer<FileSystem.FileSystem>

const Settle = Span.declare({ id: 'settle', name: 'settle', attrs: Schema.Struct({ 'app.order.id': Schema.String }) })
const taxonomy = Taxonomy.make({ id: 't', spans: [Settle], edges: [], forbid: [] })

const selfContained = Contract.of(taxonomy)
  .stimulate(Stimulus.make({ name: 'settle', run: ({ input }: { readonly input: string }) => Effect.succeed(input) }))
  .holds(Rel.exists(Settle))

const needsInventory = Contract.of(taxonomy)
  .stimulate(Stimulus.make({ name: 'count', run: () => Effect.flatMap(Inventory, (inventory) => inventory.count) }))
  .holds(Rel.exists(Settle))

describe('Suite.make', () => {
  it('opens a suite over a scenario layer providing the observation services', () => {
    expect(Suite.make(bindings)('s').withScenarioLayer).type.toBeCallableWith(harness)
  })

  it('refuses a scenario layer missing the observation service', () => {
    expect(Suite.make(bindings)('s').withScenarioLayer).type.not.toBeCallableWith(fileSystemOnly)
  })

  it('accepts a case whose behaviour needs only what the scenario layer provides', () => {
    Suite.make(bindings)('s').withScenarioLayer(harnessWithInventory).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })

  it('refuses a case whose behaviour needs a service the scenario layer does not provide', () => {
    Suite.make(bindings)('s').withScenarioLayer(harness).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('settles', selfContained, 'order-1')
      expect(Case).type.not.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })
})
