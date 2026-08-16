/**
 * Tag-set parity as properties: the errors module must expose exactly the 19
 * upstream error tags, 1:1, no renames, no missing, no extra (R4 —
 * enumerated from `src/core/errors.ts` at the fork point;
 * `TmpfsRootCheckpointError` included: the count is 19, not 18).
 *
 * Two properties cover the whole surface from both directions: every
 * expected tag is an exported class whose instances carry the matching
 * `_tag` (the `Effect.catchTag` dispatch surface), and every exported class
 * is one of the expected tags (nothing extra).
 */
import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
import * as Errors from '../errors.js'

/** The 19 upstream error class names, enumerated from rightsize-node's src/core/errors.ts at the fork point. */
const EXPECTED_TAGS = [
  'BackendError',
  'CheckpointArtifactMissingError',
  'CheckpointBackendMismatchError',
  'CheckpointUnsupportedError',
  'ContainerLaunchError',
  'IncompatibleImageError',
  'InvalidCheckpointNameError',
  'IsolationRequiredError',
  'MalformedCheckpointArchiveError',
  'NetworkDisabledConflictError',
  'PortBindConflictError',
  'ProvisionError',
  'RelativeContainerPathError',
  'ReuseFromCheckpointError',
  'ReuseWithNetworkError',
  'RootDiskConflictError',
  'TmpfsRootCheckpointError',
  'TmpfsRootExceedsMemoryError',
  'UnsupportedByBackendError',
] as const

const EXPECTED_SET: ReadonlySet<string> = new Set(EXPECTED_TAGS)

/** One minimal valid constructor input per tag — domain-derived, one field per upstream constructor parameter. */
const SAMPLE_INPUTS: Readonly<Record<string, object>> = {
  BackendError: { message: 'daemon failed' },
  CheckpointArtifactMissingError: { ref: 'rightsize/checkpoint:deadbeef', backend: 'docker' },
  CheckpointBackendMismatchError: { createdOnBackend: 'microsandbox', activeBackend: 'docker' },
  CheckpointUnsupportedError: { backend: 'docker' },
  ContainerLaunchError: { message: 'timed out waiting for readiness' },
  IncompatibleImageError: { suppliedRepository: 'postgres', expectedRepository: 'redis' },
  InvalidCheckpointNameError: { checkpointName: 'BAD_NAME' },
  IsolationRequiredError: { backend: 'docker' },
  MalformedCheckpointArchiveError: { archivePath: '/tmp/ckpt.tar', reason: 'no checkpoint.json member' },
  NetworkDisabledConflictError: {},
  PortBindConflictError: { message: 'bind: address already in use' },
  ProvisionError: { message: 'checksum mismatch' },
  RelativeContainerPathError: { containerPath: 'tmp/file' },
  ReuseFromCheckpointError: {},
  ReuseWithNetworkError: {},
  RootDiskConflictError: {},
  TmpfsRootCheckpointError: {},
  TmpfsRootExceedsMemoryError: { tmpfsMb: 1024, memoryMb: 512 },
  UnsupportedByBackendError: { feature: 'network links', backend: 'docker' },
}

/** Constructs an error class by tag; `undefined` when the tag names no export. */
const constructByTag = (tag: string): (Error & { readonly _tag: string }) | undefined => {
  const Constructor = Errors[tag as keyof typeof Errors] as new(input: object) => Error & { readonly _tag: string }
  if (typeof Constructor !== 'function') return undefined
  return new Constructor(SAMPLE_INPUTS[tag] ?? {})
}

describe('error taxonomy — tag-set parity with upstream (19 tags, 1:1)', () => {
  it.prop(
    '∀e_InstanceTag_≡ExpectedTag',
    [fc.constantFrom(...EXPECTED_TAGS)],
    ([tag]) => {
      const instance = constructByTag(tag)
      return instance !== undefined && instance._tag === tag
    },
  )

  it.prop(
    '∀e_ExportedClass_∈ExpectedTagSet',
    [fc.constantFrom(...Object.keys(Errors))],
    ([name]) => EXPECTED_SET.has(name) && constructByTag(name) !== undefined,
  )
})
