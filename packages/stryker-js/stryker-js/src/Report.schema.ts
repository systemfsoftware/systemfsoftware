import * as S from 'effect/Schema'

import { LocationCodec, MutantStatusCodec, PositionCodec } from './Mutant.schema.js'
import type { StandardSchemaV1 } from './Plugin.schema.js'

const OpenEndLocationCodec = S.Struct({
  start: PositionCodec,
  end: S.optional(PositionCodec),
})
export type OpenEndLocation = S.Schema.Type<typeof OpenEndLocationCodec>

const MutantResultCodec = S.Struct({
  id: S.String,
  mutatorName: S.String,
  status: MutantStatusCodec,
  location: LocationCodec,
  replacement: S.optional(S.String),
  description: S.optional(S.String),
  statusReason: S.optional(S.String),
  static: S.optional(S.Boolean),
  coveredBy: S.optional(S.Array(S.String)),
  killedBy: S.optional(S.Array(S.String)),
  testsCompleted: S.optional(S.Finite),
  duration: S.optional(S.Finite),
})
export type MutantResult = S.Schema.Type<typeof MutantResultCodec>

export const MutantResultSchema: StandardSchemaV1<unknown, MutantResult> = S.toStandardSchemaV1(MutantResultCodec)

const FileResultCodec = S.Struct({
  language: S.String,
  source: S.String,
  mutants: S.Array(MutantResultCodec),
})
export type FileResult = S.Schema.Type<typeof FileResultCodec>

export const FileResultSchema: StandardSchemaV1<unknown, FileResult> = S.toStandardSchemaV1(FileResultCodec)

const FileResultDictionaryCodec = S.Record(S.String, FileResultCodec)
export type FileResultDictionary = S.Schema.Type<typeof FileResultDictionaryCodec>

const TestDefinitionCodec = S.Struct({
  id: S.String,
  name: S.String,
  location: S.optional(OpenEndLocationCodec),
})
export type TestDefinition = S.Schema.Type<typeof TestDefinitionCodec>

const TestFileCodec = S.Struct({
  source: S.optional(S.String),
  tests: S.Array(TestDefinitionCodec),
})
export type TestFile = S.Schema.Type<typeof TestFileCodec>

const TestFileDefinitionDictionaryCodec = S.Record(S.String, TestFileCodec)
export type TestFileDefinitionDictionary = S.Schema.Type<typeof TestFileDefinitionDictionaryCodec>

const ThresholdsCodec = S.Struct({
  high: S.Finite,
  low: S.Finite,
})
export type Thresholds = S.Schema.Type<typeof ThresholdsCodec>

const BrandingInformationCodec = S.Struct({
  homepageUrl: S.String,
  imageUrl: S.optional(S.String),
})
export type BrandingInformation = S.Schema.Type<typeof BrandingInformationCodec>

const DependenciesCodec = S.Record(S.String, S.String)
export type Dependencies = S.Schema.Type<typeof DependenciesCodec>

const FrameworkInformationCodec = S.Struct({
  name: S.String,
  version: S.optional(S.String),
  branding: S.optional(BrandingInformationCodec),
  dependencies: S.optional(DependenciesCodec),
})
export type FrameworkInformation = S.Schema.Type<typeof FrameworkInformationCodec>

export const MutationTestResultCodec = S.Struct({
  schemaVersion: S.String,
  files: FileResultDictionaryCodec,
  thresholds: ThresholdsCodec,
  config: S.optional(S.Record(S.String, S.Unknown)),
  testFiles: S.optional(TestFileDefinitionDictionaryCodec),
  projectRoot: S.optional(S.String),
  framework: S.optional(FrameworkInformationCodec),
})
export type MutationTestResult = S.Schema.Type<typeof MutationTestResultCodec>

export const MutationTestResultSchema: StandardSchemaV1<unknown, MutationTestResult> = S.toStandardSchemaV1(
  MutationTestResultCodec,
)

const MetricsCodec = S.Struct({
  pending: S.Finite,
  killed: S.Finite,
  timeout: S.Finite,
  survived: S.Finite,
  noCoverage: S.Finite,
  runtimeErrors: S.Finite,
  compileErrors: S.Finite,
  ignored: S.Finite,
  totalDetected: S.Finite,
  totalUndetected: S.Finite,
  totalInvalid: S.Finite,
  totalValid: S.Finite,
  totalMutants: S.Finite,
  totalCovered: S.Finite,
  mutationScore: S.Finite,
  mutationScoreBasedOnCoveredCode: S.Finite,
})
export type Metrics = S.Schema.Type<typeof MetricsCodec>

export const MetricsSchema: StandardSchemaV1<unknown, Metrics> = S.toStandardSchemaV1(MetricsCodec)

export interface MetricsResult {
  readonly name: string
  readonly metrics: Metrics
  readonly childResults: readonly MetricsResult[]
}

export const MetricsResultCodec: S.Codec<MetricsResult> = S.Struct({
  name: S.String,
  metrics: MetricsCodec,
  childResults: S.Array(S.suspend((): S.Codec<MetricsResult> => MetricsResultCodec)),
}).annotate({ identifier: 'MetricsResult' })

export const MetricsResultSchema: StandardSchemaV1<unknown, MetricsResult> = S.toStandardSchemaV1(MetricsResultCodec)
