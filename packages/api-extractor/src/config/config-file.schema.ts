/// <reference types="vitest/importMeta" />
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

/** The log level a message reporting rule assigns; `none` suppresses the message. */
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
  overrideTsconfig: Schema.optional(Schema.Json),
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

/** How output files end their lines: Windows, POSIX, or the OS default. */
export const NewlineKind = Schema.Literals(['crlf', 'lf', 'os'])
export type NewlineKind = typeof NewlineKind.Type

/** How enum members are ordered when generating the doc model. */
export const EnumMemberOrder = Schema.Literals(['by-name', 'preserve'])
export type EnumMemberOrder = typeof EnumMemberOrder.Type

/**
 * The upstream `api-extractor.json` shape, decoded from the defaults-merged record: every field is
 * optional except `mainEntryPointFilePath`, which upstream requires there, and unknown keys are
 * refused exactly where upstream's schema sets `additionalProperties: false`.
 */
export const ConfigFile = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  apiReport: Schema.optional(ApiReportConfig),
  bundledPackages: Schema.optional(Schema.Array(Schema.String)),
  compiler: Schema.optional(CompilerConfig),
  docModel: Schema.optional(DocModelConfig),
  dtsRollup: Schema.optional(DtsRollupConfig),
  enumMemberOrder: Schema.optional(EnumMemberOrder),
  extends: Schema.optional(Schema.String),
  mainEntryPointFilePath: Schema.String,
  messages: Schema.optional(MessagesConfig),
  newlineKind: Schema.optional(NewlineKind),
  projectFolder: Schema.optional(Schema.String),
  quiet: Schema.optional(Schema.Boolean),
  testMode: Schema.optional(Schema.Boolean),
  tsdocMetadata: Schema.optional(TsdocMetadataConfig),
})
export type ConfigFile = typeof ConfigFile.Type

const literalSetNames = [
  'newlineKind',
  'apiReportVariant',
  'messageLogLevel',
  'enumMemberOrder',
  'releaseTagForTrim',
] as const

type LiteralSetName = (typeof literalSetNames)[number]

/** The independent domain contract each closed literal set is checked against. */
const literalLabelsOf = (name: LiteralSetName): ReadonlyArray<string> =>
  Match.value(name).pipe(
    Match.when('newlineKind', (): ReadonlyArray<string> => ['crlf', 'lf', 'os']),
    Match.when('apiReportVariant', (): ReadonlyArray<string> => ['public', 'beta', 'alpha', 'complete']),
    Match.when('messageLogLevel', (): ReadonlyArray<string> => ['error', 'warning', 'none']),
    Match.when('enumMemberOrder', (): ReadonlyArray<string> => ['by-name', 'preserve']),
    Match.when('releaseTagForTrim', (): ReadonlyArray<string> => ['@internal', '@alpha', '@beta', '@public']),
    Match.exhaustive,
  )

/** Whether the named closed literal set accepts the candidate, read from the schema itself. */
const admitsLiteral = (name: LiteralSetName, value: string): boolean =>
  Match.value(name).pipe(
    Match.when('newlineKind', () => Result.isSuccess(Schema.decodeUnknownResult(NewlineKind)(value))),
    Match.when('apiReportVariant', () => Result.isSuccess(Schema.decodeUnknownResult(ApiReportVariant)(value))),
    Match.when('messageLogLevel', () => Result.isSuccess(Schema.decodeUnknownResult(MessageLogLevel)(value))),
    Match.when('enumMemberOrder', () => Result.isSuccess(Schema.decodeUnknownResult(EnumMemberOrder)(value))),
    Match.when('releaseTagForTrim', () => Result.isSuccess(Schema.decodeUnknownResult(ReleaseTagForTrim)(value))),
    Match.exhaustive,
  )

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_ClosedLiteralRefusal_≡Membership',
    {
      of: [
        Schema.Literals(literalSetNames),
        Schema.Union([
          Schema.Literals(['crlf', 'lf', 'os', 'public', 'beta', 'alpha', 'complete', 'error', 'warning', 'none']),
          Schema.Literals(['by-name', 'preserve', '@internal', '@alpha', '@beta', '@public']),
          Schema.String,
        ]),
      ],
      subject: admitsLiteral,
    },
    (subject, [name, value]) => subject(name, value) === literalLabelsOf(name).includes(value),
  )
}
