/**
 * Checkpoint ref minting (R14) — the backend-specific opaque ref a
 * checkpoint's committed state is addressed by. Behavioral source:
 * upstream rightsize-node `src/core/checkpoint/ref.ts` (Apache-2.0).
 *
 * docker mints `rightsize/checkpoint:<suffix>` (a committed image tag);
 * msb mints an absolute `<cacheDir>/checkpoints/rz-ckpt-<suffix>` path —
 * the artifact directory msb's snapshot CLI writes via its `--dest-dir`
 * shape. `name` present (a NAMED checkpoint) makes the suffix — and
 * therefore the whole ref — deterministic: re-checkpointing the same name
 * reproduces the exact same ref, which is what makes the registry's
 * replace semantics correct. `name` absent mints a fresh random 12-hex
 * suffix.
 *
 * `path.resolve`, not `path.join`: a relative `RIGHTSIZE_CACHE_DIR`
 * override must still yield an absolute ref — every path-ref branch
 * elsewhere classifies a ref by absoluteness alone.
 */
import { randomBytes } from 'node:crypto'
import * as path from 'node:path'

import type { BackendName } from '../runtime/runtime.js'

/** The docker ref prefix — committed image repo (`rightsize/checkpoint:<suffix>`). */
export const DOCKER_CHECKPOINT_REPO = 'rightsize/checkpoint'

/** The msb artifact prefix — every snapshot directory this library's refs name starts with it (the recursive-removal guard, U9b). */
export const MSB_CHECKPOINT_PREFIX = 'rz-ckpt-'

/**
 * The backend-specific checkpoint ref for `suffix` (a validated name, or a
 * random 12-hex when omitted). docker: `rightsize/checkpoint:<suffix>`;
 * msb: `<cacheDir>/checkpoints/rz-ckpt-<suffix>` (absolute).
 */
export const checkpointRef = (
  backend: BackendName,
  name: string | undefined,
  cacheDir: string,
): string => {
  const suffix = name ?? randomBytes(6).toString('hex')
  return backend === 'msb'
    ? path.resolve(cacheDir, 'checkpoints', `${MSB_CHECKPOINT_PREFIX}${suffix}`)
    : `${DOCKER_CHECKPOINT_REPO}:${suffix}`
}
