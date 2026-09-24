import { Schema } from 'effect'

export const MessageLogLevel = Schema.Literals(['error', 'warning', 'none'])
export type MessageLogLevel = typeof MessageLogLevel.Type

export const MessageReportingRule = Schema.Struct({
  logLevel: MessageLogLevel,
  addToApiReportFile: Schema.optional(Schema.Boolean),
})
export type MessageReportingRule = typeof MessageReportingRule.Type

export const MessageReportingTable = Schema.Record(Schema.String, MessageReportingRule)
export type MessageReportingTable = typeof MessageReportingTable.Type

export const MessagesConfig = Schema.Struct({
  compilerMessageReporting: Schema.optional(MessageReportingTable),
  extractorMessageReporting: Schema.optional(MessageReportingTable),
  tsdocMessageReporting: Schema.optional(MessageReportingTable),
})
export type MessagesConfig = typeof MessagesConfig.Type

export const CompilerConfig = Schema.Struct({
  overrideTsconfig: Schema.optional(Schema.Unknown),
  skipLibCheck: Schema.optional(Schema.Boolean),
  tsconfigFilePath: Schema.optional(Schema.String),
})
export type CompilerConfig = typeof CompilerConfig.Type

export const ApiReportVariant = Schema.Literals(['public', 'beta', 'alpha', 'complete'])
export type ApiReportVariant = typeof ApiReportVariant.Type

export const ApiReportConfig = Schema.Struct({
  enabled: Schema.Boolean,
  includeForgottenExports: Schema.optional(Schema.Boolean),
  reportFileName: Schema.optional(Schema.String),
  reportFolder: Schema.optional(Schema.String),
  reportTempFolder: Schema.optional(Schema.String),
  reportVariants: Schema.optional(Schema.Array(ApiReportVariant)),
  tagsToReport: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
})
export type ApiReportConfig = typeof ApiReportConfig.Type

export const ReleaseTagForTrim = Schema.Literals(['@internal', '@alpha', '@beta', '@public'])
export type ReleaseTagForTrim = typeof ReleaseTagForTrim.Type

export const DocModelConfig = Schema.Struct({
  apiJsonFilePath: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  includeForgottenExports: Schema.optional(Schema.Boolean),
  projectFolderUrl: Schema.optional(Schema.String),
  releaseTagsToTrim: Schema.optional(Schema.Array(ReleaseTagForTrim)),
})
export type DocModelConfig = typeof DocModelConfig.Type

export const DtsRollupConfig = Schema.Struct({
  alphaTrimmedFilePath: Schema.optional(Schema.String),
  betaTrimmedFilePath: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  omitTrimmingComments: Schema.optional(Schema.Boolean),
  publicTrimmedFilePath: Schema.optional(Schema.String),
  untrimmedFilePath: Schema.optional(Schema.String),
})
export type DtsRollupConfig = typeof DtsRollupConfig.Type

export const TsdocMetadataConfig = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  tsdocMetadataFilePath: Schema.optional(Schema.String),
})
export type TsdocMetadataConfig = typeof TsdocMetadataConfig.Type

export const NewlineKind = Schema.Literals(['crlf', 'lf', 'os'])
export type NewlineKind = typeof NewlineKind.Type

export const EnumMemberOrder = Schema.Literals(['by-name', 'preserve'])
export type EnumMemberOrder = typeof EnumMemberOrder.Type

export const ConfigFile = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  apiReport: Schema.optional(ApiReportConfig),
  bundledPackages: Schema.optional(Schema.Array(Schema.String)),
  compiler: Schema.optional(CompilerConfig),
  docModel: Schema.optional(DocModelConfig),
  dtsRollup: Schema.optional(DtsRollupConfig),
  enumMemberOrder: Schema.optional(EnumMemberOrder),
  extends: Schema.optional(Schema.String),
  mainEntryPointFilePath: Schema.optional(Schema.String),
  messages: Schema.optional(MessagesConfig),
  newlineKind: Schema.optional(NewlineKind),
  projectFolder: Schema.optional(Schema.String),
  quiet: Schema.optional(Schema.Boolean),
  testMode: Schema.optional(Schema.Boolean),
  tsdocMetadata: Schema.optional(TsdocMetadataConfig),
})
export type ConfigFile = typeof ConfigFile.Type
