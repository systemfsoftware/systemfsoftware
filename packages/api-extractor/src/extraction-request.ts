import type { Verbosity } from './collector/verbosity.schema.js'
import type { ExtractorConfig } from './config/extractor-config.js'

import type { ExtractorRunOptions } from './extraction-request.schema.js'

export type { ExtractorRunOptions }

export interface ExtractorRunInput {
  readonly configFilePath: string
  readonly options: ExtractorRunOptions
}

export interface ExtractionRequest {
  readonly config: ExtractorConfig
  readonly options: ExtractorRunOptions
  readonly verbosity: Verbosity
}
