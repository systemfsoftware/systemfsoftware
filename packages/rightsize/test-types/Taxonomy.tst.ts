/**
 * U12 taxonomy-parity pin: the COMPLETE public error tag set of the package
 * root is exactly the 19 upstream rightsize tags, 1:1 (R4), plus the new
 * fleet tags the agent-native surface added (R15) — 23 tags total.
 *
 * The model module's 19-tag runtime parity (no-extra, instance-_tag
 * identity) is already asserted by src/model/__tests__/errors.schema
 * .property.test.ts. THIS file pins the union across the two surfaces at the
 * type level: the fleet tags join the same taxonomy, and a rename, a
 * missing class, or a duplicated tag fails `test:types`. Adapter-internal
 * tags that never leave the root barrel (WireDecodeError,
 * TeardownFactContradictionError) are out of scope by construction: the
 * barrel is the taxonomy a consumer can match on.
 */
import { describe, expect, it } from 'tstyche'
import type {
  BackendError,
  CheckpointArtifactMissingError,
  CheckpointBackendMismatchError,
  CheckpointUnsupportedError,
  ContainerLaunchError,
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
  // ── fleet additions (R15) ────────────────────────────────────────────
  | MalformedHandleError['_tag']
  | HandleBackendMismatchError['_tag']
  | UnreachableMsbAgentError['_tag']
  | ReapFactContradictionError['_tag']

/** The same 23 literals — the union equality is both directions, so a rename, removal, or merge fails. */
type ExpectedTags =
  | 'CheckpointArtifactMissingError'
  | 'CheckpointBackendMismatchError'
  | 'CheckpointUnsupportedError'
  | 'ContainerLaunchError'
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
  | 'BackendError'
  | 'UnsupportedByBackendError'

describe('the complete public error taxonomy (19 upstream + fleet)', () => {
  it('Should_BeExactlyTheExpectedTagSet_When_AllErrorTagsAreCollected', () => {
    expect<Taxonomy>().type.toBe<ExpectedTags>()
  })
})
