import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

/**
 * The one atomic tmp+rename file writer shared by every persistence seam
 * (the reaping ledger, the reuse registry, the checkpoint registry).
 *
 * Protocol (identical on the success path to every seam it replaces):
 * `mkdir -p` the directory, write the tmp file, rename it over the target —
 * a concurrent reader only ever observes the previous complete file or the
 * new one, never a partial write.
 *
 * Failure hygiene (adopted from the ledger's `writeLinesAtomic`): on ANY
 * failure — mkdir, write, or rename — the tmp file is best-effort unlinked
 * before the original error propagates, so a failed write never leaks a
 * `.tmp` file behind. Callers keep their own tmp-file naming so the
 * leading-dot convention every dot-filtering directory listing (e.g. the
 * checkpoint registry's `listCheckpointNames`) depends on is preserved per
 * seam.
 *
 * The JSON serialization happens HERE, not in the callers: every caller is
 * an Effect-importing module where the effect tsconfig's
 * `preferSchemaOverJson` gate bans `JSON.stringify`, while this module
 * deliberately imports neither `effect` nor any node module beyond
 * `fs/promises`/`path` — the one place a plain JSON write is legal.
 *
 * Plain promise-chained, no `async` declarations (this package's effect
 * tsconfig profile bans them) — every caller wraps this in its own channel
 * (`Effect.tryPromise` / `withChain`).
 */
export const writeFileAtomic = (
  dir: string,
  target: string,
  tmpName: string,
  value: unknown,
): Promise<void> => {
  const tmp = path.join(dir, tmpName)
  return fsp
    .mkdir(dir, { recursive: true })
    .then(() => fsp.writeFile(tmp, JSON.stringify(value)))
    .then(() => fsp.rename(tmp, target))
    .catch((error: unknown) => {
      // The tmp file is the only artifact this write created that must not
      // outlive the failure — unlink is best-effort and never masks the
      // original error.
      fsp.unlink(tmp).catch(() => {})
      throw error
    })
}
