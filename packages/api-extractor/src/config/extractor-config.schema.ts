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

export const ExtractorReportConfig = Schema.Struct({
  variant: ApiReportVariant,
  fileName: Schema.String,
})
export type ExtractorReportConfig = typeof ExtractorReportConfig.Type

export const ResolvedApiReport = Schema.Struct({
  ...ApiReportConfig.fields,
  reportConfigs: Schema.Array(ExtractorReportConfig),
})
export type ResolvedApiReport = typeof ResolvedApiReport.Type

export const ResolvedTsdocMetadata = Schema.Struct({
  ...TsdocMetadataConfig.fields,
  filePath: Schema.String,
})
export type ResolvedTsdocMetadata = typeof ResolvedTsdocMetadata.Type

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
  tsdocMetadata: ResolvedTsdocMetadata,
  messages: MessagesConfig,
})
export type ExtractorConfig = typeof ExtractorConfig.Type
