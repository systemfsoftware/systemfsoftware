import * as Schema from 'effect/Schema'

export const ExpectedArtifact = Schema.Struct({
  path: Schema.String,
  text: Schema.String,
})

export type ExpectedArtifact = Schema.Schema.Type<typeof ExpectedArtifact>

export const RenderedArtifacts = Schema.Struct({
  decision: Schema.String,
  artifacts: Schema.Array(ExpectedArtifact),
})

export type RenderedArtifacts = Schema.Schema.Type<typeof RenderedArtifacts>

export const ExtractedPackage = Schema.Literals([
  'ambient-alias',
  'analyzer',
  'external-api',
  'external-star',
  'global-reference',
  'node-ambient',
  'value-import-type',
  'report-parity/simple-pkg',
  'rollup/ae3',
  'rollup/nested',
  'rollup/star',
  'extractor-flow/simple-pkg',
  'extractor-flow/simple-pkg-drifted',
])

export type ExtractedPackage = Schema.Schema.Type<typeof ExtractedPackage>

export const ExpectedArtifacts = Schema.Struct({ promised: RenderedArtifacts })

export type ExpectedArtifacts = Schema.Schema.Type<typeof ExpectedArtifacts>