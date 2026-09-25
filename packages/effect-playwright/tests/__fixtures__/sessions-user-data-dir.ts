import { Effect } from 'effect'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const withTempUserDataDir = <A, E, R>(
  use: (dir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.scoped(
    Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), 'effect-playwright-sessions-'))),
      (dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
    ).pipe(Effect.flatMap((dir) => use(dir))),
  )
