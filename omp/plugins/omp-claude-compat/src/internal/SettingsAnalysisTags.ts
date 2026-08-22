import type { DisableSource, SettingsSource } from '../HookSettings.schema.js'

/**
 * Tag carriers for the settings-analysis commands. `HookSettings.schema.ts`
 * may export only schema declarations and the type vocabulary built from them
 * (`schema-file-exports-schemas-only`), so the six command tags live here as
 * const+type pairs and are spread at every construction site, mirroring the
 * `HookEventCommand` carriers in `HookDispatcherExecutor.ts`.
 */
const SettingsAnalysisMergeTag = { _tag: 'Merge' } as const
type SettingsAnalysisMergeTag = typeof SettingsAnalysisMergeTag

const SettingsAnalysisCoverageTag = { _tag: 'Coverage' } as const
type SettingsAnalysisCoverageTag = typeof SettingsAnalysisCoverageTag

const SettingsAnalysisDisabledCoverageTag = { _tag: 'DisabledCoverage' } as const
type SettingsAnalysisDisabledCoverageTag = typeof SettingsAnalysisDisabledCoverageTag

const SettingsAnalysisUnsupportedHookTypesTag = { _tag: 'UnsupportedHookTypes' } as const
type SettingsAnalysisUnsupportedHookTypesTag = typeof SettingsAnalysisUnsupportedHookTypesTag

const SettingsAnalysisMatcherUnreadableTag = { _tag: 'MatcherUnreadable' } as const
type SettingsAnalysisMatcherUnreadableTag = typeof SettingsAnalysisMatcherUnreadableTag

const SettingsAnalysisIfEvaluatingEventTag = { _tag: 'IfEvaluatingEvent' } as const
type SettingsAnalysisIfEvaluatingEventTag = typeof SettingsAnalysisIfEvaluatingEventTag

export type SettingsAnalysisMergeCommand = SettingsAnalysisMergeTag & {
  readonly sources: readonly SettingsSource[]
}

export type SettingsAnalysisCoverageCommand = SettingsAnalysisCoverageTag & {
  readonly json: unknown
}

export type SettingsAnalysisDisabledCoverageCommand = SettingsAnalysisDisabledCoverageTag & {
  readonly sources: readonly DisableSource[]
}

export type SettingsAnalysisUnsupportedHookTypesCommand = SettingsAnalysisUnsupportedHookTypesTag & {
  readonly json: unknown
}

export type SettingsAnalysisMatcherUnreadableCommand = SettingsAnalysisMatcherUnreadableTag & {
  readonly event: string
}

export type SettingsAnalysisIfEvaluatingEventCommand = SettingsAnalysisIfEvaluatingEventTag & {
  readonly event: string
}

export type SettingsAnalysisCommand =
  | SettingsAnalysisMergeCommand
  | SettingsAnalysisCoverageCommand
  | SettingsAnalysisDisabledCoverageCommand
  | SettingsAnalysisUnsupportedHookTypesCommand
  | SettingsAnalysisMatcherUnreadableCommand
  | SettingsAnalysisIfEvaluatingEventCommand

export const settingsAnalysisTags = {
  Merge: SettingsAnalysisMergeTag,
  Coverage: SettingsAnalysisCoverageTag,
  DisabledCoverage: SettingsAnalysisDisabledCoverageTag,
  UnsupportedHookTypes: SettingsAnalysisUnsupportedHookTypesTag,
  MatcherUnreadable: SettingsAnalysisMatcherUnreadableTag,
  IfEvaluatingEvent: SettingsAnalysisIfEvaluatingEventTag,
} as const
