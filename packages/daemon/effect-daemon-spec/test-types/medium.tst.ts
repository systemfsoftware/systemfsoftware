import type { Context } from 'effect'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'
import type { ShutdownMode } from '../src/kernel/SupervisorPolicy.schema.js'
import type { TerminationReason } from '../src/kernel/TerminationReport.schema.js'
import { Medium } from '../src/Supervisor/mod.js'

declare const start: (program: string) => Effect.Effect<Medium.Started, never, never>
declare const report: (evidence: Medium.Started) => Effect.Effect<TerminationReason, never, never>
declare const probe: (evidence: Medium.Started) => Effect.Effect<boolean, never, never>
declare const stop: (evidence: Medium.Started, mode: ShutdownMode) => Effect.Effect<Medium.Stopped, never, never>
declare const evidence: Medium.Started

describe('the obligations Medium.make requires', () => {
  it('Should_AcceptTheCall_When_EveryObligationIsCarried', () => {
    expect(Medium.make).type.toBeCallableWith({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      start,
      report,
      probe,
      stop,
    })
  })

  it('Should_RefuseTheCall_When_StartIsMissing', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      report,
      probe,
      stop,
    })
  })

  it('Should_RefuseTheCall_When_TheDeclarationIsMissing', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      start,
      report,
      probe,
      stop,
    })
  })

  it('Should_RefuseTheCall_When_TheTerminationReportIsMissing', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      start,
      probe,
      stop,
    })
  })

  it('Should_RefuseTheCall_When_TheLivenessProbeIsMissing', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      start,
      report,
      stop,
    })
  })

  it('Should_RefuseTheCall_When_TheOwnedShutdownIsMissing', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      start,
      report,
      probe,
    })
  })

  it('Should_InferTheProgramInsideStart_When_TheDeclaredProgramTypeIsGiven', () => {
    Medium.make<string>({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      start: (program) => {
        expect(program).type.toBe<string>()
        return Effect.succeed(Medium.started(Effect.void))
      },
      report,
      probe,
      stop,
    })
  })

  it('Should_InferTheEvidenceAndModeInsideStop_When_ThePortIsWritten', () => {
    Medium.make<string>({
      declaration: { reporting: 'full', groupStop: 'atomic' },
      start,
      report,
      probe,
      stop: (evidence, mode) => {
        expect(evidence).type.toBe<Medium.Started>()
        expect(mode).type.toBe<ShutdownMode>()
        return Effect.succeed(Medium.stopped)
      },
    })
  })
})

describe('the medium a valid call builds', () => {
  const medium = Medium.make({
    declaration: { reporting: 'full', groupStop: 'atomic' },
    start,
    report,
    probe,
    stop,
  })

  it('Should_CarryEveryChannelOfThePorts_When_TheMediumIsBuilt', () => {
    expect(medium).type.toBe<Medium.Medium<string, never, never>>()
  })

  it('Should_DeclareTheReportedLevelAndGroupStopGuarantee_When_TheMediumIsBuilt', () => {
    expect(medium.declaration).type.toBe<Medium.MediumDeclaration>()
  })
})

describe('the evidence stop demands', () => {
  const medium = Medium.make({
    declaration: { reporting: 'full', groupStop: 'atomic' },
    start,
    report,
    probe,
    stop,
  })

  it('Should_AcceptStartedEvidence_When_StopIsCalled', () => {
    expect(medium.stop).type.toBeCallableWith(evidence, { _tag: 'Brutal' })
    expect(medium.stop).type.toBeCallableWith(evidence, { _tag: 'Graceful', millis: 100 })
    expect(medium.stop).type.toBeCallableWith(evidence, { _tag: 'Infinity' })
  })

  it('Should_RefuseAnythingButStartedEvidence_When_StopIsCalled', () => {
    expect(medium.stop).type.not.toBeCallableWith({}, { _tag: 'Brutal' })
    expect(medium.stop).type.not.toBeCallableWith({ ready: Effect.void }, { _tag: 'Brutal' })
    expect(medium.stop).type.not.toBeCallableWith(Medium.stopped, { _tag: 'Brutal' })
  })

  it('Should_RefuseACallWithoutAMode_When_StopIsCalled', () => {
    expect(medium.stop).type.not.toBeCallableWith(evidence)
    expect(medium.stop).type.not.toBeCallableWith(evidence, 'brutal')
  })

  it('Should_ReturnStoppedEvidence_When_StopCompletes', () => {
    expect(medium.stop(evidence, { _tag: 'Brutal' })).type.toBe<Effect.Effect<Medium.Stopped, never, never>>()
  })
})

describe('the declaration the schema refuses', () => {
  it('Should_RefuseADeclarationWithoutAReportingLevel', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { groupStop: 'atomic' },
      start,
      report,
      probe,
      stop,
    })
  })

  it('Should_RefuseADeclarationWithoutAGroupStopGuarantee', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'full' },
      start,
      report,
      probe,
      stop,
    })
  })

  it('Should_RefuseAnUnknownReportingLevel', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'mystery', groupStop: 'atomic' },
      start,
      report,
      probe,
      stop,
    })
  })

  it('Should_RefuseAnUnknownGroupStopGuarantee', () => {
    expect(Medium.make).type.not.toBeCallableWith({
      declaration: { reporting: 'full', groupStop: 'eventually' },
      start,
      report,
      probe,
      stop,
    })
  })

  it('Should_AcceptADeclarationCarryingBothFacts', () => {
    expect(Medium.make).type.toBeCallableWith({
      declaration: { reporting: 'inferred', groupStop: 'eventual' },
      start,
      report,
      probe,
      stop,
    })
  })
})

describe('the evidence types', () => {
  it('Should_CarryTheReadinessSignal_When_StartedEvidenceIsBuilt', () => {
    expect(Medium.started(Effect.void)).type.toBe<Medium.Started>()
    expect(Medium.started(Effect.void).ready).type.toBe<Effect.Effect<void, never, never>>()
  })

  it('Should_StayUnforgeable_When_AnObjectLiteralClaimsTheStage', () => {
    expect({ ready: Effect.void }).type.not.toBeAssignableTo<Medium.Started>()
    expect({}).type.not.toBeAssignableTo<Medium.Stopped>()
  })

  it('Should_KeepStartedAndStoppedDistinct', () => {
    expect<Medium.Started>().type.not.toBeAssignableTo<Medium.Stopped>()
    expect<Medium.Stopped>().type.not.toBeAssignableTo<Medium.Started>()
  })
})

describe('the medium port a driver binds', () => {
  it('Should_DeclareAContextService_When_ThePortIsKeyedByProgramType', () => {
    expect(Medium.MediumPort<{ readonly id: string }>('FiberMedium')).type.toBe<
      Context.Service<
        Medium.MediumPortShape<{ readonly id: string }>,
        Medium.MediumPortShape<{ readonly id: string }>
      >
    >()
    expect(Medium.MediumPort<{ readonly id: string }>('FiberMedium').key).type.toBe<string>()
  })
})
