import { Schema } from 'effect'

import {
  ApiReportConfig,
  ApiReportVariant,
  DocModelConfig,
  DtsRollupConfig,
  EnumMemberOrder,
  MessagesConfig,
  NewlineKind,
  TsdocMetadataConfig,
} from './config-file.schema.js'

/** One report variant the run emits, and the file name its content goes to. */
export const ExtractorReportConfig = Schema.Struct({
  variant: ApiReportVariant,
  fileName: Schema.String,
})
export type ExtractorReportConfig = typeof ExtractorReportConfig.Type

/** An api report section with the concrete files the report names resolve to. */
export const ResolvedApiReport = Schema.Struct({
  ...ApiReportConfig.fields,
  reportConfigs: Schema.Array(ExtractorReportConfig),
})
export type ResolvedApiReport = typeof ResolvedApiReport.Type

/**
 * The rich configuration a run works with: every path is absolute, every default is applied,
 * and the tokens in the source file are gone. `overrideTsconfig`, when present, is the compiler
 * configuration the run uses instead of reading `tsconfigFilePath` (R25).
 */
export const ExtractorConfig = Schema.Struct({
  configFilePath: Schema.String,
  projectFolder: Schema.String,
  packageFolder: Schema.optional(Schema.String),
  packageJson: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  mainEntryPointFilePath: Schema.String,
  bundledPackages: Schema.Array(Schema.String),
  tsconfigFilePath: Schema.String,
  overrideTsconfig: Schema.optional(Schema.Json),
  skipLibCheck: Schema.Boolean,
  newlineKind: NewlineKind,
  enumMemberOrder: EnumMemberOrder,
  testMode: Schema.Boolean,
  quiet: Schema.Boolean,
  apiReport: ResolvedApiReport,
  docModel: DocModelConfig,
  dtsRollup: DtsRollupConfig,
  tsdocMetadata: TsdocMetadataConfig,
  messages: MessagesConfig,
})
export type ExtractorConfig = typeof ExtractorConfig.Type
