import { convertToLf } from '../analyzer/text.js'
import type { Collector } from '../collector/Collector.js'
import type { ApiReportVariant, NewlineKind } from '../config/config-file.schema.js'
import { ApiReportGenerator } from './api-report-generator.js'
import { DtsRollupGenerator, DtsRollupKind } from './dts-rollup-generator.js'

export * from './api-report-generator.js'
export * from './dts-emit-helpers.js'
export * from './dts-rollup-generator.js'
export * from './namespace-aliaser.js'

export const convertNewlines = (text: string, newlineKind: NewlineKind): string => {
  const lfText = convertToLf(text)
  if (newlineKind === 'crlf') {
    return lfText.replaceAll('\n', '\r\n')
  }
  return lfText
}

export const renderApiReport = (collector: Collector, variant: ApiReportVariant): string =>
  ApiReportGenerator.generateReviewFileContent(collector, variant)

export const renderDtsRollup = (collector: Collector, kind: DtsRollupKind): string =>
  DtsRollupGenerator.generateTypingsFileContent(collector, kind)
