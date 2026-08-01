/**
 * Executor cell — I/O shell for the dispatch-doctrine gate.
 *
 * Reads `dispatch_doctrine_skills` from the merged TOML config through
 * the shared `TomlLoader`, returning the skill list. Absent or empty
 * disables the gate per R6 — the handler checks `skills.length > 0` to
 * know whether to fire. Mirrors `no-skill-delegation.executor.ts` shape
 * (`Effect.gen`, `yield* TomlLoader`, sandwiched read).
 *
 * The executor is the only cell that owns the `TomlLoader` dependency
 * for this gate; the handler imports the function and does not touch
 * the loader itself.
 */

import type { PlatformError } from '@effect/platform/Error'
import { TomlLoader } from '@systemfsoftware/omp-utils'
import type { TomlConfig } from '@systemfsoftware/omp-utils'
import { Effect } from 'effect'

export function runDispatchDoctrineConfig(
  cwd: string,
): Effect.Effect<readonly string[], PlatformError, TomlLoader> {
  return Effect.gen(function*() {
    const loader = yield* TomlLoader
    const config: TomlConfig = yield* loader.load(cwd)
    return config['dispatch_doctrine_skills'] ?? []
  })
}
