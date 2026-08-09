import { Schema } from 'effect'

export const ResolutionKindSchema = Schema.Literal('node10', 'node16-cjs', 'node16-esm', 'bundler')
export type ResolutionKind = Schema.Schema.Type<typeof ResolutionKindSchema>

export const ResolutionOptionSchema = Schema.Literal('node10', 'node16', 'bundler')
export type ResolutionOption = Schema.Schema.Type<typeof ResolutionOptionSchema>

export const ProblemKindSchema = Schema.Literal(
  'NoResolution',
  'UntypedResolution',
  'FalseESM',
  'FalseCJS',
  'CJSResolvesToESM',
  'NamedExports',
  'FallbackCondition',
  'FalseExportDefault',
  'MissingExportEquals',
  'UnexpectedModuleSyntax',
  'InternalResolutionError',
  'CJSOnlyExportsDefault',
)
export type ProblemKind = Schema.Schema.Type<typeof ProblemKindSchema>

export const ModuleKindReasonSchema = Schema.Literal('extension', 'type', 'no:type')
export type ModuleKindReason = Schema.Schema.Type<typeof ModuleKindReasonSchema>

export const ModuleKindSyntaxSchema = Schema.Literal(1, 99)
export type ModuleKindSyntax = Schema.Schema.Type<typeof ModuleKindSyntaxSchema>

export const CommonJSModuleKind = 1 as const
export const ESNextModuleKind = 99 as const

export const ModuleKindSchema = Schema.Struct({
  detectedKind: ModuleKindSyntaxSchema,
  detectedReason: ModuleKindReasonSchema,
  reasonFileName: Schema.String,
})
export type ModuleKind = Schema.Schema.Type<typeof ModuleKindSchema>

export const ResolutionSchema = Schema.Struct({
  fileName: Schema.String,
  isTypeScript: Schema.Boolean,
  isJson: Schema.Boolean,
  trace: Schema.Array(Schema.String),
})
export type Resolution = Schema.Schema.Type<typeof ResolutionSchema>

export const EntrypointResolutionAnalysisSchema = Schema.Struct({
  name: Schema.String,
  resolutionKind: ResolutionKindSchema,
  isWildcard: Schema.optional(Schema.Boolean),
  resolution: Schema.optional(ResolutionSchema),
  implementationResolution: Schema.optional(ResolutionSchema),
  files: Schema.optional(Schema.Array(Schema.String)),
  visibleProblems: Schema.optional(Schema.Array(Schema.Number)),
})
export type EntrypointResolutionAnalysis = Schema.Schema.Type<typeof EntrypointResolutionAnalysisSchema>

export const NoResolutionProblemSchema = Schema.Struct({
  kind: Schema.Literal('NoResolution'),
  entrypoint: Schema.String,
  resolutionKind: ResolutionKindSchema,
})
export type NoResolutionProblem = Schema.Schema.Type<typeof NoResolutionProblemSchema>

export const UntypedResolutionProblemSchema = Schema.Struct({
  kind: Schema.Literal('UntypedResolution'),
  entrypoint: Schema.String,
  resolutionKind: ResolutionKindSchema,
})
export type UntypedResolutionProblem = Schema.Schema.Type<typeof UntypedResolutionProblemSchema>

export const FalseESMProblemSchema = Schema.Struct({
  kind: Schema.Literal('FalseESM'),
  typesFileName: Schema.String,
  implementationFileName: Schema.String,
  typesModuleKind: ModuleKindSchema,
  implementationModuleKind: ModuleKindSchema,
})
export type FalseESMProblem = Schema.Schema.Type<typeof FalseESMProblemSchema>

export const FalseCJSProblemSchema = Schema.Struct({
  kind: Schema.Literal('FalseCJS'),
  typesFileName: Schema.String,
  implementationFileName: Schema.String,
  typesModuleKind: ModuleKindSchema,
  implementationModuleKind: ModuleKindSchema,
})
export type FalseCJSProblem = Schema.Schema.Type<typeof FalseCJSProblemSchema>

export const CJSResolvesToESMProblemSchema = Schema.Struct({
  kind: Schema.Literal('CJSResolvesToESM'),
  entrypoint: Schema.String,
  resolutionKind: ResolutionKindSchema,
})
export type CJSResolvesToESMProblem = Schema.Schema.Type<typeof CJSResolvesToESMProblemSchema>

export const NamedExportsProblemSchema = Schema.Struct({
  kind: Schema.Literal('NamedExports'),
  typesFileName: Schema.String,
  implementationFileName: Schema.String,
  isMissingAllNamed: Schema.Boolean,
  missing: Schema.Array(Schema.String),
})
export type NamedExportsProblem = Schema.Schema.Type<typeof NamedExportsProblemSchema>

export const FallbackConditionProblemSchema = Schema.Struct({
  kind: Schema.Literal('FallbackCondition'),
  entrypoint: Schema.String,
  resolutionKind: ResolutionKindSchema,
})
export type FallbackConditionProblem = Schema.Schema.Type<typeof FallbackConditionProblemSchema>

export const FalseExportDefaultProblemSchema = Schema.Struct({
  kind: Schema.Literal('FalseExportDefault'),
  typesFileName: Schema.String,
  implementationFileName: Schema.String,
})
export type FalseExportDefaultProblem = Schema.Schema.Type<typeof FalseExportDefaultProblemSchema>

export const MissingExportEqualsProblemSchema = Schema.Struct({
  kind: Schema.Literal('MissingExportEquals'),
  typesFileName: Schema.String,
  implementationFileName: Schema.String,
})
export type MissingExportEqualsProblem = Schema.Schema.Type<typeof MissingExportEqualsProblemSchema>

export const InternalResolutionErrorProblemSchema = Schema.Struct({
  kind: Schema.Literal('InternalResolutionError'),
  fileName: Schema.String,
  pos: Schema.Number,
  end: Schema.Number,
  resolutionOption: ResolutionOptionSchema,
  moduleSpecifier: Schema.String,
  resolutionMode: Schema.Number,
  trace: Schema.Array(Schema.String),
})
export type InternalResolutionErrorProblem = Schema.Schema.Type<typeof InternalResolutionErrorProblemSchema>

export const UnexpectedModuleSyntaxProblemSchema = Schema.Struct({
  kind: Schema.Literal('UnexpectedModuleSyntax'),
  fileName: Schema.String,
  pos: Schema.Number,
  end: Schema.Number,
  syntax: ModuleKindSyntaxSchema,
  moduleKind: ModuleKindSchema,
})
export type UnexpectedModuleSyntaxProblem = Schema.Schema.Type<typeof UnexpectedModuleSyntaxProblemSchema>

export const CJSOnlyExportsDefaultProblemSchema = Schema.Struct({
  kind: Schema.Literal('CJSOnlyExportsDefault'),
  fileName: Schema.String,
  pos: Schema.Number,
  end: Schema.Number,
})
export type CJSOnlyExportsDefaultProblem = Schema.Schema.Type<typeof CJSOnlyExportsDefaultProblemSchema>

export const ProblemSchema = Schema.Union(
  NoResolutionProblemSchema,
  UntypedResolutionProblemSchema,
  FalseESMProblemSchema,
  FalseCJSProblemSchema,
  CJSResolvesToESMProblemSchema,
  NamedExportsProblemSchema,
  FallbackConditionProblemSchema,
  FalseExportDefaultProblemSchema,
  MissingExportEqualsProblemSchema,
  InternalResolutionErrorProblemSchema,
  UnexpectedModuleSyntaxProblemSchema,
  CJSOnlyExportsDefaultProblemSchema,
)
export type Problem = Schema.Schema.Type<typeof ProblemSchema>
