/**
 * U12 taxonomy-parity pin: the COMPLETE public error tag set of the package
 * root is exactly the 19 upstream rightsize tags, 1:1 (R4), the 3
 * runtime/discovery layer tags the root barrel also exports
 * (BackendUnreachableError, FreePortExhaustedError,
 * UnsupportedDockerHostError), plus the new fleet tags the agent-native
 * surface added (R15) — 26 tags total.
 *
 * The model module's 19-tag runtime parity (no-extra, instance-_tag
 * identity) is already asserted by src/model/__tests__/errors.schema
 * .property.test.ts. THIS file pins the union across the three surfaces at
 * the type level: the fleet tags join the same taxonomy, and a rename, a
 * missing class, or a duplicated tag fails `test:types`. Adapter-internal
 * tags that never leave the root barrel (WireDecodeError,
 * TeardownFactContradictionError, ReapRuns, ReapSkipped) are out of scope
 * by construction: the barrel is the taxonomy a consumer can match on. The
 * rollup exports IS in this pin — is asserted at runtime by
 * src/__tests__/parity-gates.test.ts (parses the etc/ api reports +
 * src/), so the pin cannot silently lag a new exported error.
 */
import { describe, expect, it } from 'tstyche'
import type {
  BackendError,
  BackendUnreachableError,
  CheckpointArtifactMissingError,
  CheckpointBackendMismatchError,
  CheckpointUnsupportedError,
  ContainerLaunchError,
  FreePortExhaustedError,
  HandleBackendMismatchError,
  IncompatibleImageError,
  InvalidCheckpointNameError,
  IsolationRequiredError,
  MalformedCheckpointArchiveError,
  MalformedHandleError,
  NetworkDisabledConflictError,
  PortBindConflictError,
  ProvisionError,
  ReapFactContradictionError,
  RelativeContainerPathError,
  ReuseFromCheckpointError,
  ReuseWithNetworkError,
  RootDiskConflictError,
  TmpfsRootCheckpointError,
  TmpfsRootExceedsMemoryError,
  UnreachableMsbAgentError,
  UnsupportedByBackendError,
  UnsupportedDockerHostError,
} from '../src/index.js'

/** Every public error class instance carries exactly its own `_tag` literal. */
type Taxonomy =
  | UnsupportedByBackendError['_tag']
  | PortBindConflictError['_tag']
  | ContainerLaunchError['_tag']
  | BackendError['_tag']
  | ProvisionError['_tag']
  | ReuseWithNetworkError['_tag']
  | IsolationRequiredError['_tag']
  | CheckpointUnsupportedError['_tag']
  | CheckpointBackendMismatchError['_tag']
  | ReuseFromCheckpointError['_tag']
  | RelativeContainerPathError['_tag']
  | InvalidCheckpointNameError['_tag']
  | CheckpointArtifactMissingError['_tag']
  | IncompatibleImageError['_tag']
  | MalformedCheckpointArchiveError['_tag']
  | RootDiskConflictError['_tag']
  | TmpfsRootExceedsMemoryError['_tag']
  | NetworkDisabledConflictError['_tag']
  | TmpfsRootCheckpointError['_tag']
  // ── runtime / discovery layers (R4's 19 are model; these are the layer errors the root barrel also exports) ──
  | BackendUnreachableError['_tag']
  | FreePortExhaustedError['_tag']
  | UnsupportedDockerHostError['_tag']
  // ── fleet additions (R15) ────────────────────────────────────────────
  | MalformedHandleError['_tag']
  | HandleBackendMismatchError['_tag']
  | UnreachableMsbAgentError['_tag']
  | ReapFactContradictionError['_tag']

/** The same 26 literals — the union equality is both directions, so a rename, removal, or merge fails. */
type ExpectedTags =
  | 'BackendUnreachableError'
  | 'CheckpointArtifactMissingError'
  | 'CheckpointBackendMismatchError'
  | 'CheckpointUnsupportedError'
  | 'ContainerLaunchError'
  | 'FreePortExhaustedError'
  | 'HandleBackendMismatchError'
  | 'IncompatibleImageError'
  | 'InvalidCheckpointNameError'
  | 'IsolationRequiredError'
  | 'MalformedCheckpointArchiveError'
  | 'MalformedHandleError'
  | 'NetworkDisabledConflictError'
  | 'PortBindConflictError'
  | 'ProvisionError'
  | 'ReapFactContradictionError'
  | 'RelativeContainerPathError'
  | 'ReuseFromCheckpointError'
  | 'ReuseWithNetworkError'
  | 'RootDiskConflictError'
  | 'TmpfsRootCheckpointError'
  | 'TmpfsRootExceedsMemoryError'
  | 'UnreachableMsbAgentError'
  | 'UnsupportedDockerHostError'
  | 'BackendError'
  | 'UnsupportedByBackendError'

describe('the complete public error taxonomy (19 upstream + 3 runtime/discovery + fleet)', () => {
  it('Should_BeExactlyTheExpectedTagSet_When_AllErrorTagsAreCollected', () => {
    expect<Taxonomy>().type.toBe<ExpectedTags>()
  })
})
