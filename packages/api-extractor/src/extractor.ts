/**
 * The `Extractor` facade: one config file in, one `ExtractorResult` out.
 *
 * Ports upstream `apps/api-extractor/src/api/Extractor.ts` onto Effect. The
 * program `runEffect` leaves its requirements open over
 * `FileSystem | Path | Terminal`; the shells (`src/invoke.ts`, `src/cli.ts`)
 * are the only places that bind Node layers (KTD6: ports in pure modules,
 * adapters at the shell).
 *
 * Outcome is a *result*, not a rejection: message-level findings (warnings, API
 * report drift, forgotten exports) are counted into `ExtractorResult` and never
 * raised into the typed channel. Only structural failures — an unreadable or
 * invalid config, an unusable tsconfig, a generator that cannot express the
 * input — reach `ExtractorError`.
 *
 * Every line the run prints (banner, configuration path, compiler preamble,
 * success footer) goes through the one `MessageRouter` whose verbosity came
 * from `resolveVerbosity` (KTD5), so `--quiet` and `"quiet": true` suppress
 * chatter at the gate instead of filtering formatted output afterwards.
 */
import type * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import type { ExtractorError } from './errors/index.js'
import { runExtractor } from './extractor.cell.js'
import type { ExtractorResult, ExtractorRunOptions } from './extractor.cell.js'
import type { MessageWriter } from './message-writer.service.js'

export type { ExtractorResult, ExtractorRunOptions }

/**
 * The engine version, reported by `--version` and in the run banner.
 */
export const extractorVersion = '0.1.0'

/**
 * Run the extractor over `configFilePath`.
 *
 * The config is loaded here — a bad config is a typed `ExtractorError`, not a
 * rejection — and the whole pipeline runs in-process: config, compiler state,
 * symbol collection, generation.
 */
export const runEffect = (
  configFilePath: string,
  options: ExtractorRunOptions = {},
): Effect.Effect<
  ExtractorResult,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> =>
  runExtractor.run({
    configFilePath,
    options,
    extractorVersion,
  })
