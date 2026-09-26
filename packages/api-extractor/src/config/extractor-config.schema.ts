import { Schema } from 'effect'

import { PackageJson as PackageJsonSchema } from '../analyzer/graph/package-json.schema.js'
import { AbsolutePath } from './absolute-path.schema.js'
import { ApiReportVariant, EnumMemberOrder, MessagesConfig, NewlineKind } from './config-file.schema.js'

/** One report variant the run emits, and the file name its content goes to. */
export const ExtractorReportConfig = Schema.Struct({
  variant: ApiReportVariant,
  fileName: Schema.String,
})
export type ExtractorReportConfig = typeof ExtractorReportConfig.Type

/** The nearest package manifest was found: its folder and its decoded manifest always travel together. */
export const PackageFound = Schema.TaggedStruct('PackageFound', {
  folder: AbsolutePath,
  packageJson: PackageJsonSchema,
})
export type PackageFound = typeof PackageFound.Type

/** No package manifest was found for the project. */
export const NoPackage = Schema.TaggedStruct('NoPackage', {})
export type NoPackage = typeof NoPackage.Type

/** Where the project's manifest sits, or that there is none: one variant per state. */
export const PackageLocation = Schema.Union([PackageFound, NoPackage])
export type PackageLocation = typeof PackageLocation.Type

/** The compiler configuration comes from the file at `tsconfigFilePath`. */
export const CompilerOverrideAbsent = Schema.TaggedStruct('CompilerOverrideAbsent', {})
export type CompilerOverrideAbsent = typeof CompilerOverrideAbsent.Type

/** The compiler configuration is the run's own `compiler.overrideTsconfig` value (R25). */
export const CompilerOverridePresent = Schema.TaggedStruct('CompilerOverridePresent', {
  tsconfig: Schema.Json,
})
export type CompilerOverridePresent = typeof CompilerOverridePresent.Type

/** The two ways the compiler settings reach the run; `tsconfigFilePath` is never read in the second (R25). */
export const CompilerOverride = Schema.Union([CompilerOverrideAbsent, CompilerOverridePresent])
export type CompilerOverride = typeof CompilerOverride.Type

/** No API report is written. */
export const ApiReportDisabled = Schema.TaggedStruct('ApiReportDisabled', {})
export type ApiReportDisabled = typeof ApiReportDisabled.Type

/** An API report is written: every path and default its writer needs is resolved here. */
export const ApiReportEnabled = Schema.TaggedStruct('ApiReportEnabled', {
  reportFolder: AbsolutePath,
  reportTempFolder: AbsolutePath,
  includeForgottenExports: Schema.Boolean,
  tagsToReport: Schema.Record(Schema.String, Schema.Boolean),
  reportConfigs: Schema.Array(ExtractorReportConfig),
})
export type ApiReportEnabled = typeof ApiReportEnabled.Type

/** The API report section in exactly one of its two states. */
export const ApiReportSettings = Schema.Union([ApiReportDisabled, ApiReportEnabled])
export type ApiReportSettings = typeof ApiReportSettings.Type

/** A rollup target the run writes. */
export const RollupWritten = Schema.TaggedStruct('RollupWritten', { filePath: AbsolutePath })
export type RollupWritten = typeof RollupWritten.Type

/** A rollup target the configuration leaves unset: nothing is written for that release tag. */
export const RollupSkipped = Schema.TaggedStruct('RollupSkipped', {})
export type RollupSkipped = typeof RollupSkipped.Type

/** One declaration-rollup target: a path to write, or nothing. */
export const RollupTarget = Schema.Union([RollupWritten, RollupSkipped])
export type RollupTarget = typeof RollupTarget.Type

/** No declaration rollup is written. */
export const DtsRollupDisabled = Schema.TaggedStruct('DtsRollupDisabled', {})
export type DtsRollupDisabled = typeof DtsRollupDisabled.Type

/** A declaration rollup is written: each release-tag target says whether it is written and where. */
export const DtsRollupEnabled = Schema.TaggedStruct('DtsRollupEnabled', {
  untrimmed: RollupTarget,
  alpha: RollupTarget,
  beta: RollupTarget,
  public: RollupTarget,
  omitTrimmingComments: Schema.Boolean,
})
export type DtsRollupEnabled = typeof DtsRollupEnabled.Type

/** The declaration rollup section in exactly one of its two states. */
export const DtsRollupSettings = Schema.Union([DtsRollupDisabled, DtsRollupEnabled])
export type DtsRollupSettings = typeof DtsRollupSettings.Type

/** No doc model is written; the forgotten-export flag is still part of the collection decisions. */
export const DocModelDisabled = Schema.TaggedStruct('DocModelDisabled', {
  includeForgottenExports: Schema.Boolean,
})
export type DocModelDisabled = typeof DocModelDisabled.Type

/** A doc model is written; the engine refuses this state (R27), and the flag reaches collection. */
export const DocModelEnabled = Schema.TaggedStruct('DocModelEnabled', {
  apiJsonFilePath: AbsolutePath,
  includeForgottenExports: Schema.Boolean,
})
export type DocModelEnabled = typeof DocModelEnabled.Type

/** The doc model section in exactly one of its two states. */
export const DocModelSettings = Schema.Union([DocModelDisabled, DocModelEnabled])
export type DocModelSettings = typeof DocModelSettings.Type

/** No `tsdoc-metadata.json` is written. */
export const TsdocMetadataSkipped = Schema.TaggedStruct('TsdocMetadataSkipped', {})
export type TsdocMetadataSkipped = typeof TsdocMetadataSkipped.Type

/** `tsdoc-metadata.json` is written where the manifest's declaration entry point says. */
export const TsdocMetadataDefaultPath = Schema.TaggedStruct('TsdocMetadataDefaultPath', {})
export type TsdocMetadataDefaultPath = typeof TsdocMetadataDefaultPath.Type

/** `tsdoc-metadata.json` is written at the path the configuration declares. */
export const TsdocMetadataConfiguredPath = Schema.TaggedStruct('TsdocMetadataConfiguredPath', {
  filePath: AbsolutePath,
})
export type TsdocMetadataConfiguredPath = typeof TsdocMetadataConfiguredPath.Type

/** The tsdoc-metadata section in exactly one of its three states. */
export const TsdocMetadataSettings = Schema.Union([
  TsdocMetadataSkipped,
  TsdocMetadataDefaultPath,
  TsdocMetadataConfiguredPath,
])
export type TsdocMetadataSettings = typeof TsdocMetadataSettings.Type

/**
 * The rich configuration a run works with: every path is absolute, every default is applied, and
 * the tokens in the source file are gone. Every section that upstream models as a flag beside
 * optionals is a tagged union here, so a state's fields exist only in that state and no consumer
 * probes for presence. `ConfigFile` stays the Encoded side of the file itself.
 */
export const ExtractorConfig = Schema.Struct({
  configFilePath: AbsolutePath,
  projectFolder: AbsolutePath,
  packageLocation: PackageLocation,
  mainEntryPointFilePath: AbsolutePath,
  bundledPackages: Schema.Array(Schema.String),
  tsconfigFilePath: AbsolutePath,
  overrideTsconfig: CompilerOverride,
  skipLibCheck: Schema.Boolean,
  newlineKind: NewlineKind,
  enumMemberOrder: EnumMemberOrder,
  testMode: Schema.Boolean,
  quiet: Schema.Boolean,
  apiReport: ApiReportSettings,
  docModel: DocModelSettings,
  dtsRollup: DtsRollupSettings,
  tsdocMetadata: TsdocMetadataSettings,
  messages: MessagesConfig,
})
export type ExtractorConfig = typeof ExtractorConfig.Type
