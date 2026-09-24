import { dual } from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { convertToLf } from '../analyzer/text.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
import type { ApiReportVariant, NewlineKind } from '../config/config-file.schema.js'
import { generateReviewFileContent, type RenderedApiReport } from './api-report-generator.js'
import type { RenderFailure } from './dts-emit-helpers.js'
import { DtsRollupKind, generateTypingsFileContent, type RenderedDtsRollup } from './dts-rollup-generator.js'

export * from './api-report-generator.js'
export * from './dts-emit-helpers.js'
export * from './dts-rollup-generator.js'
export * from './namespace-aliaser.js'
export type { RenderedApiReport }

export const convertNewlines = dual<
  (newlineKind: NewlineKind) => (text: string) => string,
  (text: string, newlineKind: NewlineKind) => string
>(2, (text: string, newlineKind: NewlineKind): string =>
  Match.value(newlineKind === 'crlf').pipe(
    Match.when(true, () => convertToLf(text).replaceAll('\n', '\r\n')),
    Match.when(false, () => convertToLf(text)),
    Match.exhaustive,
  ))

export const renderApiReport = dual<
  (
    variant: ApiReportVariant,
    handled: HashSet.HashSet<number>,
  ) => (snapshot: Snapshot.AnalysisSnapshot) => Result.Result<RenderedApiReport, RenderFailure>,
  (
    snapshot: Snapshot.AnalysisSnapshot,
    variant: ApiReportVariant,
    handled: HashSet.HashSet<number>,
  ) => Result.Result<RenderedApiReport, RenderFailure>
>(3, (
  snapshot: Snapshot.AnalysisSnapshot,
  variant: ApiReportVariant,
  handled: HashSet.HashSet<number>,
): Result.Result<RenderedApiReport, RenderFailure> => generateReviewFileContent(snapshot, variant, handled))

export const renderDtsRollup = dual<
  (kind: DtsRollupKind) => (snapshot: Snapshot.AnalysisSnapshot) => Result.Result<RenderedDtsRollup, RenderFailure>,
  (snapshot: Snapshot.AnalysisSnapshot, kind: DtsRollupKind) => Result.Result<RenderedDtsRollup, RenderFailure>
>(2, (
  snapshot: Snapshot.AnalysisSnapshot,
  kind: DtsRollupKind,
): Result.Result<RenderedDtsRollup, RenderFailure> => generateTypingsFileContent(snapshot, kind))
