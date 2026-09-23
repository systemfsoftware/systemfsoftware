import { Contract, Observation, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Context, Effect, type FileSystem, type Layer, Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'

class Inventory extends Context.Service<Inventory, { readonly count: Effect.Effect<number, InventoryFailure> }>()(
  'test/Inventory',
) {}

class InventoryFailure extends S.TaggedError<InventoryFailure>()('InventoryFailure', {
  reason: S.String,
}) {}

declare const bindings: Parameters<typeof Suite.make>[0]
declare const harness: Layer.Layer<Observation.Observation | FileSystem.FileSystem>
declare const harnessWithInventory: Layer.Layer<Observation.Observation | FileSystem.FileSystem | Inventory>
declare const fileSystemOnly: Layer.Layer<FileSystem.FileSystem>
declare const inventoryWithHarness: Layer.Layer<Inventory | Observation.Observation | FileSystem.FileSystem>
declare const generatedInputs: S.Schema<string>

const Settle = Span.declare({ id: 'settle', name: 'settle', attrs: S.Struct({ 'app.order.id': S.String }) })
const taxonomy = Taxonomy.make('t').pipe(Taxonomy.add(Settle))

const settle = Stimulus.make({ name: 'settle', run: ({ input }: { readonly input: string }) => Effect.succeed(input) })

const selfContained = Contract.of(taxonomy).stimulate(settle).holds(Rel.exists(Settle))

const needsInventory = Contract.of(taxonomy)
  .stimulate(
    Stimulus.make({
      name: 'count',
      run: ({ input }: { readonly input: string }) =>
        Effect.flatMap(Inventory, (inventory) => Effect.as(inventory.count, input)),
    }),
  )
  .holds(Rel.exists(Settle))

describe('Contract stages', () => {
  it('stimulate carries dual parity over the declared taxonomy and refuses an already stimulated builder', () => {
    const declared = Contract.of(taxonomy)
    expect(Contract.stimulate).type.toBeCallableWith(declared, settle)
    expect(declared.pipe(Contract.stimulate(settle))).type.toBe<Contract.Stimulated<string, string, never, never>>()
    expect(Contract.stimulate).type.not.toBeCallableWith(selfContained, settle)
  })

  it('holds is refused before a stimulus was declared', () => {
    const declared = Contract.of(taxonomy)
    const stimulated = declared.pipe(Contract.stimulate(settle))
    expect(Contract.holds(Rel.exists(Settle))).type.toBeCallableWith(stimulated)
    expect(Contract.holds(Rel.exists(Settle))).type.not.toBeCallableWith(declared)
  })

  it('judge and check are refused until a relation was declared', () => {
    const complete = Contract.of(taxonomy).stimulate(settle).holds(Rel.exists(Settle))
    const stimulated = Contract.of(taxonomy).stimulate(settle)
    expect(Contract.judge).type.toBeCallableWith(complete, 'order-1')
    expect(Contract.judge).type.not.toBeCallableWith(stimulated, 'order-1')
    expect(Contract.check).type.toBeCallableWith(complete, 'order-1')
    expect(Contract.check).type.not.toBeCallableWith(stimulated, 'order-1')
    expect(Contract.check('order-1')).type.toBeCallableWith(complete)
    expect(Contract.check('order-1')).type.not.toBeCallableWith(stimulated)
  })

  it('judge answers the verdict on the success channel and check refuses a break on the error channel', () => {
    expect(Contract.judge(selfContained, 'order-1')).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        Contract.ContractDecodeError | Observation.EmptyObservationError,
        Observation.Observation | FileSystem.FileSystem
      >
    >()
    expect(selfContained.pipe(Contract.judge('order-1', { dumpName: 'case' }))).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        Contract.ContractDecodeError | Observation.EmptyObservationError,
        Observation.Observation | FileSystem.FileSystem
      >
    >()
    expect(Contract.check(selfContained, 'order-1')).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        Contract.ContractDecodeError | Observation.EmptyObservationError | Contract.TraceDisparityError,
        Observation.Observation | FileSystem.FileSystem
      >
    >()
  })

  it('check carries the behaviour failure on the error channel and never erases it', () => {
    const checked = needsInventory.pipe(Contract.check('order-1'))
    expect(checked).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        Contract.CheckFailure<InventoryFailure>,
        Inventory | Observation.Observation | FileSystem.FileSystem
      >
    >()
    expect(checked).type.not.toBe<Effect.Effect<Contract.Judgment<string, string>, never, never>>()
  })
})

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

  it('opens a suite-wide layer only when it also carries the observation services', () => {
    expect(Suite.make(bindings)('s').withLayer).type.not.toBeCallableWith(fileSystemOnly)
    expect(Suite.make(bindings)('s').withLayer).type.toBeCallableWith(inventoryWithHarness)
  })

  it('a shared suite still refuses a case needing a service the shared layer omits', () => {
    Suite.make(bindings)('s').withLayer(harnessWithInventory).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('counts', needsInventory, 'order-1')
    })
    Suite.make(bindings)('s').withLayer(harness).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('settles', selfContained, 'order-1')
      expect(Case).type.not.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })

  it('accepts a prop case over a generated schema and refuses a bare example value', () => {
    Suite.make(bindings)('s').withScenarioLayer(harnessWithInventory).body(({ Case }) => {
      expect(Case.prop).type.toBeCallableWith('counts', needsInventory, generatedInputs)
      expect(Case.prop).type.not.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })
})
