import { Schema } from 'effect'

import { type Problem, ProblemSchema } from './problem.schema.js'
import { type EntrypointInfo, EntrypointInfoSchema } from './resolution.schema.js'
import { ResolutionOptionSchema } from './resolution.schema.js'

export const BuildToolSchema = Schema.Literal(
  '@systemfsoftware/arethetypeswrong-cli',
  'typescript',
  'rollup',
  '@rollup/plugin-typescript',
  '@rollup/plugin-typescript2',
  'webpack',
  'esbuild',
  'parcel-bundler',
  '@preconstruct/cli',
  'vite',
  'snowpack',
  'microbundle',
  '@microsoft/api-extractor',
  'tshy',
  '@rspack/cli',
  'tsup',
  'tsdown',
)
export type BuildTool = Schema.Schema.Type<typeof BuildToolSchema>

export const IncludedTypesSchema = Schema.Struct({ kind: Schema.Literal('included') })
export const TypesPackageSchema = Schema.Struct({
  kind: Schema.Literal('@types'),
  packageName: Schema.String,
  packageVersion: Schema.String,
  definitelyTypedUrl: Schema.optional(Schema.String),
})
export const AnalysisTypesSchema = Schema.Union(IncludedTypesSchema, TypesPackageSchema)
export type AnalysisTypes = Schema.Schema.Type<typeof AnalysisTypesSchema>

const AnyProgramInfoSchema: Schema.Schema<unknown> = Schema.Any

export const AnalysisSchema = Schema.Struct({
  packageName: Schema.String,
  packageVersion: Schema.String,
  buildTools: Schema.Record({ key: Schema.String, value: Schema.String }),
  types: AnalysisTypesSchema,
  entrypoints: Schema.Record({ key: Schema.String, value: EntrypointInfoSchema }),
  programInfo: Schema.Record({ key: ResolutionOptionSchema, value: AnyProgramInfoSchema }),
  problems: Schema.Array(ProblemSchema),
})
export type Analysis = Schema.Schema.Type<typeof AnalysisSchema>

export const UntypedResultSchema = Schema.Struct({
  packageName: Schema.String,
  packageVersion: Schema.String,
  types: Schema.Literal(false),
})
export type UntypedResult = Schema.Schema.Type<typeof UntypedResultSchema>

export const CheckResultSchema = Schema.Union(AnalysisSchema, UntypedResultSchema)
export type CheckResult = Schema.Schema.Type<typeof CheckResultSchema>

export type Analysis_ = Analysis & {
  entrypoints: Record<string, EntrypointInfo>
  problems: readonly Problem[]
}
