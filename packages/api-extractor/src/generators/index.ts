import * as HashSet from 'effect/HashSet'
import { convertToLf } from '../analyzer/text.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
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

export interface RenderedApiReport {
  readonly text: string
  readonly consumed: HashSet.HashSet<number>
}

export const renderApiReport = (
  snapshot: Snapshot.AnalysisSnapshot,
  variant: ApiReportVariant,
  handled: HashSet.HashSet<number>,
): RenderedApiReport => ApiReportGenerator.generateReviewFileContent(snapshot, variant, handled)

export const renderDtsRollup = (snapshot: Snapshot.AnalysisSnapshot, kind: DtsRollupKind): string =>
  DtsRollupGenerator.generateTypingsFileContent(snapshot, kind)
