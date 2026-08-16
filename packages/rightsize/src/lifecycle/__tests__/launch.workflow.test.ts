/**
 * Launch-validation workflow tests — the full rejection matrix plus the
 * ordering obligations (R5, R7, F1).
 *
 * Every rejection here fires with zero I/O by construction: `decideLaunch`
 * is a pure `Workflow.make` function from a recorded-facts command to a
 * `Result`, with no services, no config, and no environment reads — each
 * test builds the command union directly and calls the decision
 * synchronously.
 */
import { Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import type { RuntimeCapabilities } from '../../model/capabilities.schema.js'
import type { ContainerSpec } from '../../model/container-spec.schema.js'
import {
  CheckpointBackendMismatchError,
  IncompatibleImageError,
  IsolationRequiredError,
  NetworkDisabledConflictError,
  ReuseFromCheckpointError,
  ReuseWithNetworkError,
  RootDiskConflictError,
  TmpfsRootExceedsMemoryError,
} from '../../model/errors.js'
import { newContainerSpec } from '../../model/spec-combinators.js'
import { decideLaunch, type LaunchCommand, LaunchValidated } from '../launch.workflow.js'

/** The default docker capability board — shared kernel, native networks, health inspection. */
const DOCKER_CAPABILITIES: RuntimeCapabilities = {
  hardwareIsolated: false,
  checkpoint: true,
  checkpointRestartsWorkload: false,
  supportsNativeNetworks: true,
  healthInspection: true,
}

/** The msb capability board — hardware-isolated microVMs, no native networks, no health inspection. */
const MSB_CAPABILITIES: RuntimeCapabilities = {
  hardwareIsolated: true,
  checkpoint: true,
  checkpointRestartsWorkload: true,
  supportsNativeNetworks: false,
  healthInspection: false,
}

const spec = (overrides: Partial<ContainerSpec> = {}): ContainerSpec => ({
  ...newContainerSpec('redis:8.6-alpine', 'rz-test-1'),
  ...overrides,
})

const command = (overrides: Partial<Omit<Extract<LaunchCommand, { readonly _tag: 'ValidateLaunch' }>, '_tag'>> = {}) =>
  ({
    _tag: 'ValidateLaunch',
    spec: spec(),
    backend: 'docker',
    capabilities: DOCKER_CAPABILITIES,
    reuseRequested: false,
    reuseEnabled: false,
    expectedRepository: undefined,
    checkpointSourceBackend: undefined,
    ...overrides,
  }) as const

const expectValidated = (input: ReturnType<typeof command>) => {
  const decision = decideLaunch(input)
  expect(Result.isSuccess(decision)).toBe(true)
  expect(Result.getOrThrow(decision)).toBeInstanceOf(LaunchValidated)
}

const expectRejected = (input: ReturnType<typeof command>, ErrorClass: unknown) => {
  const decision = decideLaunch(input)
  expect(Result.isFailure(decision)).toBe(true)
  const failureOption = Result.getFailure(decision)
  expect(Option.isSome(failureOption)).toBe(true)
  expect(Option.getOrThrow(failureOption)).toBeInstanceOf(ErrorClass as new(...args: never[]) => unknown)
}

describe('decideLaunch — clean spec (no rejection fires)', () => {
  it('Should_Validate_When_SpecIsClean', () => {
    expectValidated(command())
  })

  it('Should_Validate_When_ModuleImageMatchesItsGate', () => {
    expectValidated(command({ spec: spec({ image: 'redis:8.6-alpine' }), expectedRepository: 'redis' }))
  })

  it('Should_Validate_When_IsolationDemandMetByHardwareBackend', () => {
    expectValidated(command({ spec: spec({ requireIsolation: true }), backend: 'msb', capabilities: MSB_CAPABILITIES }))
  })
})

describe('decideLaunch root-disk/network conflicts (R4, upstream validateSpecConflicts order)', () => {
  it('Should_RejectBothRootDiskAndTmpfsRoot_When_BothLimitsSet', () => {
    expectRejected(command({ spec: spec({ diskLimitMb: 1024, tmpfsRootMb: 512 }) }), RootDiskConflictError)
  })

  it('Should_RejectTmpfsRoot_When_ItExceedsTheMemoryLimit', () => {
    const decision = decideLaunch(command({ spec: spec({ tmpfsRootMb: 1024, memoryLimitMb: 512 }) }))
    expect(Result.isFailure(decision)).toBe(true)
    const failure = Option.getOrThrow(Result.getFailure(decision))
    expect(failure).toBeInstanceOf(TmpfsRootExceedsMemoryError)
    expect(failure).toMatchObject({ _tag: 'TmpfsRootExceedsMemoryError', tmpfsMb: 1024, memoryMb: 512 })
  })

  it('Should_AcceptTmpfsRoot_When_ItFitsTheMemoryLimit', () => {
    expectValidated(command({ spec: spec({ tmpfsRootMb: 512, memoryLimitMb: 1024 }) }))
  })

  it('Should_AcceptTmpfsRoot_When_NoExplicitMemoryLimit', () => {
    expectValidated(command({ spec: spec({ tmpfsRootMb: 512 }) }))
  })

  it('Should_RejectNetworkDisabledJoin_When_NetworkAssigned', () => {
    expectRejected(
      command({ spec: spec({ networkDisabled: true, networkId: 'rz-net-1234abcd' }) }),
      NetworkDisabledConflictError,
    )
  })

  it('Should_AcceptNetworkDisabled_When_NoNetworkJoined', () => {
    expectValidated(command({ spec: spec({ networkDisabled: true }) }))
  })
})

describe('decideLaunch capability gate (IsolationRequiredError)', () => {
  it('Should_RejectIsolationDemand_When_BackendSharesTheHostKernel', () => {
    const decision = decideLaunch(command({ spec: spec({ requireIsolation: true }) }))
    expect(Result.isFailure(decision)).toBe(true)
    const failure = Option.getOrThrow(Result.getFailure(decision))
    expect(failure).toBeInstanceOf(IsolationRequiredError)
    expect(failure).toMatchObject({ _tag: 'IsolationRequiredError', backend: 'docker' })
  })

  it('Should_AcceptIsolationDemand_When_BackendIsHardwareIsolated', () => {
    expectValidated(command({ spec: spec({ requireIsolation: true }), backend: 'msb', capabilities: MSB_CAPABILITIES }))
  })

  it('Should_AcceptSpec_When_SharedKernelBackend', () => {
    expectValidated(command({ spec: spec({ requireIsolation: false }) }))
  })
})

describe('decideLaunch reuse gate (double opt-in, upstream semantics)', () => {
  it('Should_RejectReuseWithNetwork_When_ReuseActiveAndNetworkAssigned', () => {
    expectRejected(
      command({ spec: spec({ keepAlive: true, networkId: 'rz-net-1' }), reuseRequested: true, reuseEnabled: true }),
      ReuseWithNetworkError,
    )
  })

  it('Should_AcceptReuseWithNetwork_When_ReuseMarkerButEnvNotEnabled', () => {
    // The second half of the double opt-in is missing: requested-but-not-
    // enabled starts as an ordinary ephemeral container (upstream).
    expectValidated(
      command({ spec: spec({ keepAlive: true, networkId: 'net-1' }), reuseRequested: true, reuseEnabled: false }),
    )
  })

  it('Should_AcceptNetworkJoin_When_OnlyKeepAliveWasRequested', () => {
    // withKeepAlive alone is not the reuse marker — no reuse gate applies.
    expectValidated(command({ spec: spec({ keepAlive: true, networkId: 'net-1' }), reuseEnabled: true }))
  })

  it('Should_RejectReuseFromCheckpoint_When_ReuseIsActiveAndCheckpointRefSet', () => {
    expectRejected(
      command({
        spec: spec({ keepAlive: true, checkpointRef: 'rightsize/checkpoint:abc' }),
        reuseRequested: true,
        reuseEnabled: true,
      }),
      ReuseFromCheckpointError,
    )
  })

  it('Should_PreferNetworkRejection_When_ReuseConflictAndNetworkBothViolate', () => {
    // The network check precedes the checkpoint check (upstream order).
    expectRejected(
      command({
        spec: spec({ keepAlive: true, networkId: 'net-1', checkpointRef: 'rightsize/checkpoint:abc' }),
        reuseRequested: true,
        reuseEnabled: true,
      }),
      ReuseWithNetworkError,
    )
  })
})

describe('decideLaunch module image gate (IncompatibleImageError)', () => {
  it('Should_RejectImage_When_RepositoryDoesNotDeclareTheExpectedOne', () => {
    const decision = decideLaunch(command({ spec: spec({ image: 'postgres:17' }), expectedRepository: 'redis' }))
    expect(Result.isFailure(decision)).toBe(true)
    const failure = Option.getOrThrow(Result.getFailure(decision))
    expect(failure).toBeInstanceOf(IncompatibleImageError)
    expect(failure).toMatchObject({
      _tag: 'IncompatibleImageError',
      suppliedRepository: 'postgres',
      expectedRepository: 'redis',
    })
  })

  it('Should_AcceptImage_When_ItDeclaresTheExpectedRepository', () => {
    // A registry-qualified ref with repository 'redis' passes the gate.
    expectValidated(command({ spec: spec({ image: 'docker.io/redis:8.6-alpine' }), expectedRepository: 'redis' }))
  })

  it('Should_AcceptAnyImage_When_NoModuleGateApplies', () => {
    expectValidated(command({ spec: spec({ image: 'anything/else:1' }), expectedRepository: undefined }))
  })
})

describe('decideLaunch checkpoint backup gate (CheckpointBackendMismatchError)', () => {
  it('Should_RejectCheckpointRestore_When_SourceBackendDiffersFromActive', () => {
    const decision = decideLaunch(command({ checkpointSourceBackend: 'msb' }))
    expect(Result.isFailure(decision)).toBe(true)
    const failure = Option.getOrThrow(Result.getFailure(decision))
    expect(failure).toBeInstanceOf(CheckpointBackendMismatchError)
    expect(failure).toMatchObject({
      _tag: 'CheckpointBackendMismatchError',
      createdOnBackend: 'msb',
      activeBackend: 'docker',
    })
  })

  it('Should_AcceptCheckpointRestore_When_SourceBackendMatchesActive', () => {
    expectValidated(command({ checkpointSourceBackend: 'docker' }))
  })

  it('Should_Accept_When_NoCheckpointSourceKnown', () => {
    expectValidated(command({ checkpointSourceBackend: undefined }))
  })
})

describe('decideLaunch rejection ordering (first violation in upstream order wins)', () => {
  it('Should_RejectRootDiskConflictFirst_When_SeveralViolationsCoexist', () => {
    // Every gate violated at once: conflicts (disk+tmpfs), network-disabled
    // + network, isolation, reuse+network. The root-disk conflict is first
    // in upstream's start() — it must win.
    expectRejected(
      command({
        spec: spec({
          diskLimitMb: 1024,
          tmpfsRootMb: 512,
          networkDisabled: true,
          networkId: 'net-1',
          requireIsolation: true,
        }),
        reuseRequested: true,
        reuseEnabled: true,
      }),
      RootDiskConflictError,
    )
  })

  it('Should_RejectNetworkConflictBeforeCheckpointMismatch_When_BothViolate', () => {
    expectRejected(
      command({
        spec: spec({ networkDisabled: true, networkId: 'net-1' }),
        checkpointSourceBackend: 'msb',
      }),
      NetworkDisabledConflictError,
    )
  })

  it('Should_RejectCheckpointMismatchBeforeIsolation_When_BothViolate', () => {
    expectRejected(
      command({ spec: spec({ requireIsolation: true }), checkpointSourceBackend: 'msb' }),
      CheckpointBackendMismatchError,
    )
  })
})
