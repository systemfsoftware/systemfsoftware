import type { CliFlags, Verbosity } from './collector/verbosity.schema.js'
import type { ExtractorConfig } from './config/extractor-config.js'

export interface ExtractorRunOptions {
  readonly localBuild?: boolean | undefined
  readonly printApiReportDiff?: boolean | undefined
  readonly typescriptCompilerFolder?: string | undefined
  readonly cliFlags?: CliFlags | undefined
}

export interface ExtractorRunInput {
  readonly configFilePath: string
  readonly options: ExtractorRunOptions
}

export interface ExtractionRequest {
  readonly config: ExtractorConfig
  readonly options: ExtractorRunOptions
  readonly verbosity: Verbosity
}
