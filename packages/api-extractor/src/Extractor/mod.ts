/**
 * The single public namespace. One outside interaction — "run the extractor" — as two Sandwich
 * cells joined with `Cell.andThen`, over a pure analysis snapshot. Everything else in this
 * package (config, compiler, analyzer, collector, generators) is internal.
 *
 * Every type an exported value mentions is exported here too, so the self-hosted API report
 * carries no `ae-forgotten-export` warning (R20, KTD7).
 */
export { cell, run } from '../run-extractor.js'

export type { LogLevel } from '../collector/message-router.schema.js'
export type { CliFlags } from '../collector/verbosity.schema.js'
export type { ExtractorRunInput } from '../extraction-request.js'
export type { ExtractorRunOptions } from '../extraction-request.schema.js'

export {
  ExtractionFailed,
  ExtractionPassed,
  ReportCreated,
  ReportDriftRefused,
  ReportFolderMissing,
  ReportMissingRefused,
  ReportUnchanged,
  ReportUpdated,
} from '../choose-extraction.workflow.js'
export type { ExtractionDecision, ReportOutcome } from '../choose-extraction.workflow.js'

export * from '../errors/analysis.schema.js'
export * from '../errors/compiler.schema.js'
export * from '../errors/config.schema.js'
export { ExtractorError } from '../errors/extractor-error.schema.js'

export { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
export { MessageWriter } from '../message-writer.service.js'

export {
  type ConsoleMessageWriterOptions,
  layer,
  messageWriterLayer,
  type TextWritable,
} from '../drivers/console-message-writer.js'

export { extractorVersion as version } from '../version.js'
