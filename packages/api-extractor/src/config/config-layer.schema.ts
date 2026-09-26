import { Schema, SchemaTransformation } from 'effect'

/**
 * The layers of an `api-extractor.json` file, decoded before anything reads them. Upstream's file
 * is a foreign wire shape: this module is its Encoded side, and the Type side distinguishes the
 * settings the chain and the path anchoring act on, so no consumer probes a raw field for its
 * JavaScript type. Unknown keys are not represented here at all — the merged record is validated
 * against upstream's own schema, with upstream's error text, and nothing before that reads them.
 */

/** A JSON value that is not text. */
export const NonTextJson = Schema.Union([
  Schema.Null,
  Schema.Boolean,
  Schema.Finite,
  Schema.Array(Schema.Json),
  Schema.Record(Schema.String, Schema.Json),
])
export type NonTextJson = typeof NonTextJson.Type

/** A path setting the file wrote as text. */
export const PathText = Schema.TaggedStruct('PathText', { text: Schema.String })
export type PathText = typeof PathText.Type

/** A path setting the file wrote as something else: the value kept verbatim for the later validation. */
export const PathOther = Schema.TaggedStruct('PathOther', { value: NonTextJson })
export type PathOther = typeof PathOther.Type

/**
 * A configuration path setting: its text, or the non-text value the file carried. Anchoring
 * rewrites the text form and leaves every other value alone, exactly as upstream's
 * `_expandStringWithTokens` sees it.
 */
export const ConfiguredPath = Schema.Union([
  Schema.String.pipe(
    Schema.decodeTo(
      PathText,
      SchemaTransformation.transform({
        decode: (text: string): PathText => PathText.make({ text }),
        encode: (path: PathText): string => path.text,
      }),
    ),
  ),
  NonTextJson.pipe(
    Schema.decodeTo(
      PathOther,
      SchemaTransformation.transform({
        decode: (value: NonTextJson): PathOther => PathOther.make({ value }),
        encode: (path: PathOther): NonTextJson => path.value,
      }),
    ),
  ),
])
export type ConfiguredPath = typeof ConfiguredPath.Type

/** The path settings of the `compiler` section. */
export const CompilerLayer = Schema.Struct({
  tsconfigFilePath: Schema.optional(ConfiguredPath),
})
export type CompilerLayer = typeof CompilerLayer.Type

/** The path settings of the `apiReport` section. */
export const ApiReportLayer = Schema.Struct({
  reportFolder: Schema.optional(ConfiguredPath),
  reportTempFolder: Schema.optional(ConfiguredPath),
})
export type ApiReportLayer = typeof ApiReportLayer.Type

/** The path settings of the `docModel` section. */
export const DocModelLayer = Schema.Struct({
  apiJsonFilePath: Schema.optional(ConfiguredPath),
})
export type DocModelLayer = typeof DocModelLayer.Type

/** The path settings of the `dtsRollup` section. */
export const DtsRollupLayer = Schema.Struct({
  untrimmedFilePath: Schema.optional(ConfiguredPath),
  alphaTrimmedFilePath: Schema.optional(ConfiguredPath),
  betaTrimmedFilePath: Schema.optional(ConfiguredPath),
  publicTrimmedFilePath: Schema.optional(ConfiguredPath),
})
export type DtsRollupLayer = typeof DtsRollupLayer.Type

/** The path settings of the `tsdocMetadata` section. */
export const TsdocMetadataLayer = Schema.Struct({
  tsdocMetadataFilePath: Schema.optional(ConfiguredPath),
})
export type TsdocMetadataLayer = typeof TsdocMetadataLayer.Type

/** The path settings the root of a configuration file declares. */
export const RootLayer = Schema.Struct({
  projectFolder: Schema.optional(ConfiguredPath),
})
export type RootLayer = typeof RootLayer.Type
