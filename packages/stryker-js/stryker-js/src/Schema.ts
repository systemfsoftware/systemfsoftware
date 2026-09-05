import * as S from 'effect/Schema'

import { StrykerOptionsSchema } from './Schema.schema.js'

export type { PartialStrykerOptions, StrykerOptions } from './Schema.schema.js'
export { CoverageAnalysisMode, LogLevel, PackageManager, ReportType, StrykerOptionsSchema } from './Schema.schema.js'
export type {
  CoverageAnalysisMode as CoverageAnalysisModeType,
  LogLevel as LogLevelType,
  PackageManager as PackageManagerType,
  ReportType as ReportTypeType,
} from './Schema.schema.js'

// ---------------------------------------------------------------------------
// RENDERED_OPTION_DEFAULTS — inlined from core/rendered-option-defaults.ts
// ---------------------------------------------------------------------------

/**
 * The four option defaults a human reads about in help text.
 *
 * `Schema.schema.ts` declares every default, and a CLI that wants to
 * name one in a `--help` description must read it from here rather than type
 * the literal a second time: a restated default drifts the moment the schema
 * moves, and no gate compares a help string against a schema annotation.
 *
 * Only these four are here because only these four are rendered. A default
 * nobody prints has one declaration site already, which is the schema.
 */
export const RENDERED_OPTION_DEFAULTS = {
  coverageAnalysis: 'perTest',
  fileLogLevel: 'off',
  logLevel: 'info',
  tempDirName: '.stryker-tmp',
} as const

// ---------------------------------------------------------------------------
// propertyPath — inlined from core/property-path.ts
// ---------------------------------------------------------------------------

export type Primitive = boolean | number | string | null | undefined

/**
 * Known keys filters out the index signature from the keys of a type
 * @see https://stackoverflow.com/questions/51465182/typescript-remove-index-signature-using-mapped-types
 */
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

/**
 * Given a base type, allows type safe access to the name of a property.
 * @param prop The property name
 */
export function propertyPath<T>(): PropertyPathOverloads<T> {
  const fn: PropertyPathOverloads<T> = (...args: string[]) => args.join('.')
  return fn
}

// ---------------------------------------------------------------------------
// strykerReportBugUrl — inlined from core/stryker-report-bug-url.ts
// ---------------------------------------------------------------------------

/**
 * Creates a URL to the page where a consumer can report a bug against this
 * project.
 *
 * The tracker is ours. The ported original addressed the upstream StrykerJS
 * repository, along with its label and issue-template parameters, so every bug
 * a consumer filed from a Stryker run arrived at a project that does not own
 * this code (`REPO-O1`) and prefilled a template that does not exist here.
 *
 * @param titleSuggestion The title to be prefilled in.
 */
export function strykerReportBugUrl(titleSuggestion: string): string {
  const title = encodeURIComponent(titleSuggestion)
  return `https://github.com/systemfsoftware/systemfsoftware/issues/new?title=${title}`
}

// ---------------------------------------------------------------------------
// strykerCoreSchema — inlined from core/StrykerCoreSchema.ts
// ---------------------------------------------------------------------------

/**
 * The JSON Schema document derived from `StrykerOptionsSchema`, self-contained.
 *
 * It lives beside the schema module rather than inside it because it is a *use*
 * of that schema, not a declaration of one: `S.toJsonSchemaDocument` consumes a
 * schema and returns a plain document. Keeping uses out of a `*.schema.ts` is
 * what lets a tool read every exported schema in a package and trust that each
 * one is a schema - the generated law suite does exactly that, and a document
 * handed to `toEncoded` takes the whole suite down with it.
 */
export const strykerCoreSchema: Record<string, unknown> = (() => {
  const { schema, definitions } = S.toJsonSchemaDocument(StrykerOptionsSchema)
  if (Object.keys(definitions).length === 0) {
    return schema
  }
  return { ...schema, definitions }
})()
