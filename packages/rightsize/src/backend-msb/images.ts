/**
 * The microsandbox image adapter — `ImageRegistry` over the `msb image`
 * CLI surface. Behavioral source: upstream rightsize-node
 * `src/backend-msb/{backend.ts, commands.ts}` (Apache-2.0).
 *
 * The pinned msb CLI's proven image surface is exactly ONE command —
 * `msb image remove` (upstream's image-cache heal, exercised in the runtime
 * adapter's boot path). There is no separate pull channel: msb fetches the
 * image at the first `msb run`, so the registry's `pull` is the documented
 * no-op — warming an image would mean booting a throwaway sandbox, and the
 * boot itself is the authoritative existence check.
 *
 * `importImage` shells out to `msb image import <archive>` (per the port
 * plan's U9 phrasing — this verb is NOT among the recorded upstream vectors
 * of the pinned release, so a host whose msb does not speak it gets the
 * tool's own stderr surfaced as a typed `BackendError`, never a silent
 * success). `inspect` answers `true`: on this backend the pull gate it
 * feeds is a no-op, so a genuine existence probe adds an msb call with no
 * observable effect on any path.
 */
import { Effect } from 'effect'

import { BackendError } from '../model/errors.js'
import type { ImageRegistryService } from '../runtime/runtime.js'
import type { CommandRunnerService } from './command-runner.js'

/** One `msb image import` invocation's budget. */
export const IMAGE_TIMEOUT_MS = 120_000

/** The `ImageRegistry` adapter over one msb runner. */
export function createMsbImages(runner: CommandRunnerService): ImageRegistryService {
  return {
    // msb fetches images at the first boot; a dedicated pull channel does
    // not exist in the pinned release's proven surface.
    pull: () => Effect.void,
    // No image-presence query exists in the pinned surface; the pull gate
    // this feeds is a no-op on this backend, so the answer never routes a
    // behavior (the boot is the authoritative existence check).
    inspect: () => Effect.succeed(true),
    importImage: (archivePath) =>
      Effect.gen(function*() {
        const result = yield* runner.invoke(['image', 'import', archivePath], IMAGE_TIMEOUT_MS)
        if (result.exitCode !== 0) {
          return yield* BackendError.make({
            message: `msb image import ${archivePath} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
          })
        }
      }),
  }
}
