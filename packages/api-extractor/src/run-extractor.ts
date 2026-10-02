import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import { announceRun } from './announce-run.cell.js'
import type { ExtractionDecision } from './choose-extraction.workflow.js'
import type { TypeScriptCompiler } from './compiler/typescript-compiler.service.js'
import type { ExtractorError } from './errors/extractor-error.schema.js'
import { extractApi } from './extract-api.cell.js'
import type { ExtractorRunInput } from './extraction-request.js'
import { MessageWriter } from './message-writer.service.js'

/**
 * One outside interaction — "run the extractor" — as two Sandwich cells joined with
 * `Cell.andThen`, over a pure analysis snapshot. `announceRun` reads the config chain, decides
 * verbosity and hands on the request; `extractApi` compiles, analyzes, renders, decides each
 * report outcome and executes the ordered write plan. The written annotation pins the public
 * type, so an inferred composed union cannot churn the self-hosted report (KTD7).
 */
export const cell: Cell.Cell<
  ExtractorRunInput,
  ExtractionDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler
> = announceRun.pipe(Cell.andThen(extractApi))

/**
 * The programmatic entry: the composed cell's run. Services stay in the `R` channel; the caller
 * (or `src/main.ts`, the only interpretation edge) provides them.
 */
export const run: (
  input: ExtractorRunInput,
) => Effect.Effect<
  ExtractionDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter | TypeScriptCompiler
> = cell.run
