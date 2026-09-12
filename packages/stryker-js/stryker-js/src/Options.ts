import * as S from 'effect/Schema'

import { StrykerOptionsCodec } from './Options.schema.js'
import type { StrykerOptions } from './Options.schema.js'

export {
  CoverageAnalysisModeSchema,
  LogLevelSchema,
  MutationScoreThresholdsSchema,
  OutputFileSchema,
  PackageManagerSchema,
  ReportTypeSchema,
  StrykerOptionsSchema,
} from './Options.schema.js'

export type {
  ClearTextReporterOptions,
  CommandRunnerOptions,
  CoverageAnalysisMode,
  HtmlReporterOptions,
  JsonReporterOptions,
  LogLevel,
  MutationScoreThresholds,
  OutputFile,
  PackageManager,
  PartialStrykerOptions,
  ReportType,
  StrykerOptions,
  WarningOptions,
} from './Options.schema.js'

export type ProvidedStrykerOptions = StrykerOptions

export interface PluginInit {
  readonly traceparent?: string | undefined
  readonly tracestate?: string | undefined
}

export const RENDERED_OPTION_DEFAULTS = {
  coverageAnalysis: 'perTest',
  fileLogLevel: 'off',
  logLevel: 'info',
  tempDirName: '.stryker-tmp',
} as const

export type Primitive = boolean | number | string | null | undefined

export type KnownKeys<T> = keyof {
  [P in keyof T as string extends P ? never : number extends P ? never : P]: T[P]
}

type OnlyObject<T> = Exclude<T, Primitive>

export interface PropertyPathOverloads<T> {
  (key: KnownKeys<T>): string
  <TProp1 extends KnownKeys<T>>(
    key: TProp1,
    key2: KnownKeys<OnlyObject<T[TProp1]>>,
  ): string
  <
    TProp1 extends KnownKeys<T>,
    TProp2 extends KnownKeys<OnlyObject<T[TProp1]>>,
  >(
    key: TProp1,
    key2: TProp2,
    key3: KnownKeys<OnlyObject<OnlyObject<T[TProp1]>[TProp2]>>,
  ): string
}

export function propertyPath<T>(): PropertyPathOverloads<T> {
  return (...args: string[]) => args.join('.')
}

export function strykerReportBugUrl(titleSuggestion: string): string {
  const title = encodeURIComponent(titleSuggestion)
  return `https://github.com/systemfsoftware/systemfsoftware/issues/new?title=${title}`
}

/** A use of the option schema, not a declaration of one: schema files declare schemas. */
export const strykerCoreSchema: Record<string, unknown> = (() => {
  const { schema, definitions } = S.toJsonSchemaDocument(StrykerOptionsCodec)
  if (Object.keys(definitions).length === 0) {
    return schema
  }
  return { ...schema, definitions }
})()
