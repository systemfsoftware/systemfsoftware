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
  it('Should_CarryDualParityAndRefuseStimulatedBuilder_When_StimulateCalled', () => {
    const declared = Contract.of(taxonomy)
    expect(Contract.stimulate).type.toBeCallableWith(declared, settle)
    expect(declared.pipe(Contract.stimulate(settle))).type.toBe<Contract.Stimulated<string, string, never, never>>()
    expect(Contract.stimulate).type.not.toBeCallableWith(selfContained, settle)
  })

  it('Should_RefuseHolds_When_StimulusNotDeclared', () => {
    const declared = Contract.of(taxonomy)
    const stimulated = declared.pipe(Contract.stimulate(settle))
    expect(Contract.holds(Rel.exists(Settle))).type.toBeCallableWith(stimulated)
    expect(Contract.holds(Rel.exists(Settle))).type.not.toBeCallableWith(declared)
  })

  it('Should_RefuseJudgeAndCheck_When_RelationNotDeclared', () => {
    const complete = Contract.of(taxonomy).stimulate(settle).holds(Rel.exists(Settle))
    const stimulated = Contract.of(taxonomy).stimulate(settle)
    expect(Contract.judge).type.toBeCallableWith(complete, 'order-1')
    expect(Contract.judge).type.not.toBeCallableWith(stimulated, 'order-1')
    expect(Contract.check).type.toBeCallableWith(complete, 'order-1')
    expect(Contract.check).type.not.toBeCallableWith(stimulated, 'order-1')
    expect(Contract.check('order-1')).type.toBeCallableWith(complete)
    expect(Contract.check('order-1')).type.not.toBeCallableWith(stimulated)
  })

  it('Should_AnswerVerdictOnSuccessAndRefuseBreakOnError_When_JudgeAndCheckCalled', () => {
    expect(Contract.judge(selfContained, 'order-1')).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        | Contract.ContractDecodeError
        | Observation.EmptyObservationError
        | Observation.IncompleteObservationError
        | Observation.TransportObservationError,
        Observation.Observation | FileSystem.FileSystem
      >
    >()
    expect(selfContained.pipe(Contract.judge('order-1', { dumpName: 'case' }))).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        | Contract.ContractDecodeError
        | Observation.EmptyObservationError
        | Observation.IncompleteObservationError
        | Observation.TransportObservationError,
        Observation.Observation | FileSystem.FileSystem
      >
    >()
    expect(Contract.check(selfContained, 'order-1')).type.toBe<
      Effect.Effect<
        Contract.Judgment<string, string>,
        | Contract.ContractDecodeError
        | Observation.EmptyObservationError
        | Observation.IncompleteObservationError
        | Observation.TransportObservationError
        | Contract.TraceDisparityError,
        Observation.Observation | FileSystem.FileSystem
      >
    >()
  })

  it('Should_CarryBehaviourFailureOnErrorChannel_When_CheckCalled', () => {
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
  it('Should_OpenSuiteOverScenarioLayer_When_ObservationServicesProvided', () => {
    expect(Suite.make(bindings)('s').withScenarioLayer).type.toBeCallableWith(harness)
  })

  it('Should_RefuseScenarioLayer_When_ObservationServiceMissing', () => {
    expect(Suite.make(bindings)('s').withScenarioLayer).type.not.toBeCallableWith(fileSystemOnly)
  })

  it('Should_AcceptCase_When_ScenarioLayerProvidesItsNeeds', () => {
    Suite.make(bindings)('s').withScenarioLayer(harnessWithInventory).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })

  it('Should_RefuseCase_When_ScenarioLayerLacksNeededService', () => {
    Suite.make(bindings)('s').withScenarioLayer(harness).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('settles', selfContained, 'order-1')
      expect(Case).type.not.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })

  it('Should_OpenSuiteWideLayer_When_ObservationServicesCarried', () => {
    expect(Suite.make(bindings)('s').withLayer).type.not.toBeCallableWith(fileSystemOnly)
    expect(Suite.make(bindings)('s').withLayer).type.toBeCallableWith(inventoryWithHarness)
  })

  it('Should_RefuseCase_When_SharedLayerOmitsNeededService', () => {
    Suite.make(bindings)('s').withLayer(harnessWithInventory).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('counts', needsInventory, 'order-1')
    })
    Suite.make(bindings)('s').withLayer(harness).body(({ Case }) => {
      expect(Case).type.toBeCallableWith('settles', selfContained, 'order-1')
      expect(Case).type.not.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })

  it('Should_AcceptPropCaseAndRefuseBareValue_When_GeneratedSchemaGiven', () => {
    Suite.make(bindings)('s').withScenarioLayer(harnessWithInventory).body(({ Case }) => {
      expect(Case.prop).type.toBeCallableWith('counts', needsInventory, generatedInputs)
      expect(Case.prop).type.not.toBeCallableWith('counts', needsInventory, 'order-1')
    })
  })

  it('Should_StayOnLiveClockOnlyWithReason_When_StageDeclared', () => {
    const declared = Suite.make(bindings)('s')
    expect(declared.live).type.toBeCallableWith('binds a real loopback socket')
    expect(declared.live).type.not.toBeCallableWith()
    expect(declared.live).type.not.toBeCallableWith(1)
    expect(declared.pipe(Suite.live('binds a real loopback socket'))).type.toBe<Suite.Declared>()
  })

  it('Should_StayOnLiveClockOnlyWithReason_When_StageShared', () => {
    const shared = Suite.make(bindings)('s').withLayer(harnessWithInventory)
    expect(shared.live).type.toBeCallableWith('binds a real loopback socket')
    expect(shared.live).type.not.toBeCallableWith()
    expect(shared.pipe(Suite.live('binds a real loopback socket'))).type.toBe<Suite.Shared<Inventory>>()
  })

  it('Should_StayOnLiveClockOnlyWithReason_When_StageOpened', () => {
    const opened = Suite.make(bindings)('s').withScenarioLayer(harnessWithInventory)
    expect(opened.live).type.toBeCallableWith('binds a real loopback socket')
    expect(opened.live).type.not.toBeCallableWith()
    expect(Suite.live(opened, 'binds a real loopback socket')).type.toBe<
      Suite.Opened<Inventory | Observation.Observation | FileSystem.FileSystem>
    >()
  })
})
