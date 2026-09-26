import type { Verbosity } from './collector/verbosity.schema.js'
import type { ExtractorConfig } from './config/extractor-config.js'

import type { ExtractorRunOptions } from './extraction-request.schema.js'

export type { ExtractorRunOptions }

/**
 * What a caller hands `Extractor.run`: the config to read plus the run options. The config path
 * is located by the CLI (or supplied directly by a programmatic caller) before the run starts.
 */
export interface ExtractorRunInput {
  readonly configFilePath: string
  readonly options: ExtractorRunOptions
}

/**
 * What `announceRun` hands `extractApi`: the decoded configuration, the run options, and the
 * single effective verbosity `resolve-verbosity` decided. Internal to the composed cell.
 */
export interface ExtractionRequest {
  readonly config: ExtractorConfig
  readonly options: ExtractorRunOptions
  readonly verbosity: Verbosity
}
