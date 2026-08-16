/**
 * Launch-workflow properties (R5): the decision's channel discipline and its
 * no-false-rejection law, over schema-generated specs.
 *
 * - Discipline: for ANY generated command the decision is either the single
 *   success variant or a failure whose tag is one of the eight documented
 *   rejections — the channel never carries anything else.
 * - No false rejection: a command whose facts clear every documented guard
 *   (conflicts stripped, no network/checkpoint/reuse involvement, no
 *   isolation demand, no module image gate) MUST validate. A rejection on a
 *   cleared command would be an unexplained refusal firing before any I/O.
 *
 * Predicates are pure booleans — no `expect` inside a property.
 */
import { it } from '@effect/vitest'
import { Result, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

import { RuntimeCapabilities } from '../../model/capabilities.schema.js'
import { ContainerSpec, type ContainerSpec as ContainerSpecType } from '../../model/container-spec.schema.js'
import type { BackendName } from '../../runtime/runtime.js'
import { decideLaunch } from '../launch.workflow.js'

/** The eight documented rejection tags, written here independently of the kernel. */
const IS_REJECTION_TAG: Record<string, boolean> = {
  RootDiskConflictError: true,
  TmpfsRootExceedsMemoryError: true,
  NetworkDisabledConflictError: true,
  CheckpointBackendMismatchError: true,
  IsolationRequiredError: true,
  ReuseWithNetworkError: true,
  ReuseFromCheckpointError: true,
  IncompatibleImageError: true,
}

const factsArb = fc.record({
  spec: S.toArbitrary(ContainerSpec)(fc),
  backend: fc.constantFrom<BackendName>('docker', 'msb'),
  capabilities: S.toArbitrary(RuntimeCapabilities)(fc),
  reuseRequested: fc.boolean(),
  reuseEnabled: fc.boolean(),
  expectedRepository: fc.option(fc.string(), { nil: undefined }),
  checkpointSourceBackend: fc.option(fc.string(), { nil: undefined }),
})

/** Strips every field a documented guard reads, keeping the free parts of the draw. */
const clearedSpec = (spec: ContainerSpecType): ContainerSpecType => {
  const {
    diskLimitMb: _disk,
    tmpfsRootMb: _tmpfs,
    networkId: _network,
    checkpointRef: _checkpoint,
    ...rest
  } = spec
  return { ...rest, networkDisabled: false, requireIsolation: false, keepAlive: false }
}

it.prop('∀facts_LaunchDecision_∈DocumentedChannel', [factsArb], ([facts]) => {
  const outcome = decideLaunch({ _tag: 'ValidateLaunch', ...facts })
  if (Result.isSuccess(outcome)) {
    return outcome.success._tag === 'LaunchValidated'
  }
  return IS_REJECTION_TAG[outcome.failure._tag] === true
})

it.prop('∀facts_ClearedGuards_→LaunchValidated', [factsArb], ([facts]) => {
  const outcome = decideLaunch({
    _tag: 'ValidateLaunch',
    spec: clearedSpec(facts.spec),
    backend: facts.backend,
    capabilities: facts.capabilities,
    reuseRequested: false,
    reuseEnabled: false,
    expectedRepository: undefined,
    checkpointSourceBackend: undefined,
  })
  return Result.isSuccess(outcome) && outcome.success._tag === 'LaunchValidated'
})
