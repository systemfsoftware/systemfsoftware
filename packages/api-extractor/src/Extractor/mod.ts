/**
 * One outside interaction — "run the extractor" — as two Sandwich cells joined
 * with `Cell.andThen`, over a pure analysis snapshot. Everything else in this
 * package (analyzer, collector, generators, enhancers) is internal.
 */
export type { ExtractionRequest, ExtractorRunInput, ExtractorRunOptions } from '../extraction-request.js'
export { cell, run } from '../run-extractor.js'

export { ExtractionFailed, ExtractionPassed } from '../choose-extraction.workflow.js'
export type { ExtractionDecision, ReportOutcome } from '../choose-extraction.workflow.js'

export * from '../errors/analysis.schema.js'
export * from '../errors/compiler.schema.js'
export * from '../errors/config.schema.js'
export { ExtractorError } from '../errors/extractor-error.schema.js'

export { type ConsoleMessageWriterOptions, layer, type TextWritable } from '../drivers/console-message-writer.js'
export { MessageWriter } from '../message-writer.service.js'

export { extractorVersion as version } from '../version.js'

/**
 * The command line the published `api-extractor` bin runs. Exported side-effect
 * free so the bin edge in `src/cli.ts` stays the only place that launches it.
 */
export { cli } from '../cli/command.js'
