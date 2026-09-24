import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { type Crypto, Effect, type FileSystem, pipe, type Scope } from 'effect'
import { describe, expect, it } from 'tstyche'

type ServiceResource = MicroVM.ServiceResource
type JobResource = MicroVM.JobResource

const service = MicroVM.service('alpine:3.20')
const job = MicroVM.job('alpine:3.20', ['echo', 'hello'] as const)

describe('Configuration duals', () => {
  it('Should_AcceptTheVariantThatHonorsTheOption_When_ItIsAppliedDataFirst', () => {
    expect(MicroVM.withExposedPorts).type.toBeCallableWith(service, [8080])
    expect(MicroVM.withWaitStrategy).type.toBeCallableWith(service, MicroVM.Wait.forPort(8080))
    expect(MicroVM.withHostAccess).type.toBeCallableWith(job, true)
    expect(MicroVM.withWorkdir).type.toBeCallableWith(job, '/etc')
    expect(MicroVM.withEnv).type.toBeCallableWith(service, { K: 'V' })
    expect(MicroVM.withEnv).type.toBeCallableWith(job, { K: 'V' })
  })

  it('Should_RefuseTheVariantThatCannotHonorTheOption_When_ItIsAppliedDataFirst', () => {
    expect(MicroVM.withExposedPorts).type.not.toBeCallableWith(job, [8080])
    expect(MicroVM.withWaitStrategy).type.not.toBeCallableWith(job, MicroVM.Wait.forPort(8080))
    expect(MicroVM.withHostAccess).type.not.toBeCallableWith(service, true)
    expect(MicroVM.withWorkdir).type.not.toBeCallableWith(service, '/etc')
  })

  it('Should_PinTheVariant_When_TheServiceOnlyDualsAreApplied', () => {
    expect(MicroVM.withExposedPorts(service, [8080])).type.toBe<ServiceResource>()
    expect(pipe(service, MicroVM.withExposedPorts([8080]))).type.toBe<ServiceResource>()
    expect(MicroVM.withWaitStrategy(service, MicroVM.Wait.forPort(8080))).type.toBe<ServiceResource>()
    expect(pipe(service, MicroVM.withWaitStrategy(MicroVM.Wait.forPort(8080)))).type.toBe<ServiceResource>()
  })

  it('Should_PinTheVariant_When_TheJobOnlyDualsAreApplied', () => {
    expect(MicroVM.withHostAccess(job, true)).type.toBe<JobResource>()
    expect(pipe(job, MicroVM.withHostAccess(true))).type.toBe<JobResource>()
    expect(MicroVM.withWorkdir(job, '/etc')).type.toBe<JobResource>()
    expect(pipe(job, MicroVM.withWorkdir('/etc'))).type.toBe<JobResource>()
  })

  it('Should_PinTheVariant_When_TheSharedDualsAreApplied', () => {
    expect(pipe(service, MicroVM.withEnv({ K: 'V' }))).type.toBe<ServiceResource>()
    expect(pipe(job, MicroVM.withEnv({ K: 'V' }))).type.toBe<JobResource>()
    expect(pipe(service, MicroVM.withMount({ host: '/tmp/a', guest: '/data' }))).type.toBe<ServiceResource>()
    expect(pipe(job, MicroVM.withMount({ host: '/tmp/a', guest: '/data' }))).type.toBe<JobResource>()
    expect(pipe(service, MicroVM.withMemoryLimit(512))).type.toBe<ServiceResource>()
    expect(pipe(job, MicroVM.withMemoryLimit(512))).type.toBe<JobResource>()
  })

  it('Should_PreserveTheJobVariant_When_TheSharedDualRunsBeforeRun', () => {
    expect(
      pipe(job, MicroVM.withEnv({ K: 'V' }), MicroVM.run),
    ).type.toBe<
      Effect.Effect<
        MicroVM.JobCompletion,
        | MicroVM.ExecError
        | MicroVM.LoopbackViolationError
        | MicroVM.PortAllocationError
        | MicroVM.SandboxBootError
        | MicroVM.VirtualizationUnsupportedError,
        Crypto.Crypto | FileSystem.FileSystem | Scope.Scope
      >
    >()
    expect(pipe(job, MicroVM.withEnv({ K: 'V' }))).type.toBe<JobResource>()
  })
})
