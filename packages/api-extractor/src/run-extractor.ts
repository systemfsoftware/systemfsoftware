import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import { announceRun } from './announce-run.cell.js'
import type { ExtractionDecision } from './choose-extraction.workflow.js'
import type { ExtractorError } from './errors/index.js'
import { extractApi } from './extract-api.cell.js'
import type { ExtractorRunInput, ExtractorRunOptions } from './extraction-request.js'
import { MessageWriter } from './message-writer.service.js'

export const runExtractor = announceRun.pipe(Cell.andThen(extractApi))

export const runEffect = (
  configFilePath: string,
  options: ExtractorRunOptions = {},
): Effect.Effect<
  ExtractionDecision,
  ExtractorError | PlatformError,
  FileSystem.FileSystem | Path.Path | MessageWriter
> => runExtractor.run({ configFilePath, options } satisfies ExtractorRunInput)
