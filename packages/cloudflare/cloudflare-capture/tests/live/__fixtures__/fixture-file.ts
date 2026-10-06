import type { CaptureRun } from '@systemfsoftware/cloudflare-capture'
import { Effect } from 'effect'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(HERE, '..', '..', '..', 'fixtures', 'cloudflare-errors.json')

/**
 * Writes the run's fixture text to the package's committed fixture file and
 * answers how many answers it holds. Only a run that captured every case reaches
 * here, because a missing case fails the run first.
 */
export const writeFixture = (run: CaptureRun): Effect.Effect<number> =>
  Effect.promise(() => writeFile(FIXTURE_PATH, run.fixture, 'utf8')).pipe(Effect.as(run.records.length))
