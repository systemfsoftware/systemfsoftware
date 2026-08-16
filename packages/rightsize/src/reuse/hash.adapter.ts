/**
 * The reuse hash adapter (R14) — the one I/O edge of reuse identity: reads
 * every copy-source file's CURRENT content and hashes it, so a mutated
 * source file between two `start()` calls changes the identity (upstream
 * `computeReuseHash` semantics). Everything else stays in the pure kernel.
 *
 * A copy source that cannot be read is a typed `BackendError` — upstream
 * rejects on the same condition; the message names the host path so the
 * failure is actionable.
 */
import { createHash } from 'node:crypto'
import * as fsp from 'node:fs/promises'

import { Effect } from 'effect'

import type { ContainerSpec } from '../model/container-spec.schema.js'
import { BackendError } from '../model/errors.js'
import { type ReuseCopyDigest, reuseIdentityHash, reuseIdentityOf } from './hash.kernel.js'

const digestFile = (hostPath: string): Effect.Effect<string, BackendError> =>
  Effect.tryPromise({
    try: () => fsp.readFile(hostPath).then((content) => createHash('sha256').update(content).digest('hex')),
    catch: (error) =>
      BackendError.make({
        message: `could not hash reuse copy source '${hostPath}': ` +
          `${error instanceof Error ? error.message : 'unknown error'} — reuse identity includes copy content`,
      }),
  })

/**
 * Digests every copy source of `spec` (mounts project to copies — the same
 * set upstream hashes), preserving the guest-path mapping.
 */
export const resolveReuseCopyDigests = (
  spec: ContainerSpec,
): Effect.Effect<ReadonlyArray<ReuseCopyDigest>, BackendError> =>
  Effect.forEach(
    spec.mounts,
    (mount) => Effect.map(digestFile(mount.hostPath), (sha256) => ({ guestPath: mount.guestPath, sha256 })),
  )

/**
 * `spec`'s reuse identity hash — the deterministic adopt key: the pure
 * kernel over the spec projection + the digested copy contents.
 */
export const hashReuseSpec = (spec: ContainerSpec): Effect.Effect<string, BackendError> =>
  Effect.map(resolveReuseCopyDigests(spec), (digests) => reuseIdentityHash(reuseIdentityOf(spec), digests))
