import { Schema } from 'effect'

export const ResolutionKindSchema = Schema.Literals(['node10', 'node16-cjs', 'node16-esm', 'bundler'])
export type ResolutionKind = Schema.Schema.Type<typeof ResolutionKindSchema>

export const ResolutionOptionSchema = Schema.Literals(['node10', 'node16', 'bundler'])
export type ResolutionOption = Schema.Schema.Type<typeof ResolutionOptionSchema>

export const ProblemKindSchema = Schema.Literals([
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
])
export type ProblemKind = Schema.Schema.Type<typeof ProblemKindSchema>

export const ModuleKindReasonSchema = Schema.Literals(['extension', 'type', 'no:type'])
export type ModuleKindReason = Schema.Schema.Type<typeof ModuleKindReasonSchema>

export const ModuleKindSyntaxSchema = Schema.Literals([1, 99])
export type ModuleKindSyntax = Schema.Schema.Type<typeof ModuleKindSyntaxSchema>

export const ModuleKindSchema = Schema.Struct({
  detectedKind: ModuleKindSyntaxSchema,
  detectedReason: ModuleKindReasonSchema,
  reasonFileName: Schema.NonEmptyString,
})
export type ModuleKind = Schema.Schema.Type<typeof ModuleKindSchema>

export const ResolutionSchema = Schema.Struct({
  fileName: Schema.NonEmptyString,
  isTypeScript: Schema.Boolean.pipe(Schema.brand('IsTypeScript')),
  isJson: Schema.Boolean.pipe(Schema.brand('IsJson')),
  trace: Schema.Array(Schema.String),
})
export type Resolution = Schema.Schema.Type<typeof ResolutionSchema>

export const EntrypointResolutionAnalysisSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  resolutionKind: ResolutionKindSchema,
  isWildcard: Schema.optional(Schema.Boolean.pipe(Schema.brand('IsWildcard'))),
  resolution: Schema.optional(ResolutionSchema),
  implementationResolution: Schema.optional(ResolutionSchema),
  files: Schema.optional(Schema.Array(Schema.String)),
  visibleProblems: Schema.optional(Schema.Array(Schema.Number)),
})
export type EntrypointResolutionAnalysis = Schema.Schema.Type<typeof EntrypointResolutionAnalysisSchema>

export const NoResolutionProblemSchema = Schema.Struct({
  kind: Schema.Literal('NoResolution'),
  entrypoint: Schema.NonEmptyString,
  resolutionKind: ResolutionKindSchema,
})
export type NoResolutionProblem = Schema.Schema.Type<typeof NoResolutionProblemSchema>

export const UntypedResolutionProblemSchema = Schema.Struct({
  kind: Schema.Literal('UntypedResolution'),
  entrypoint: Schema.NonEmptyString,
  resolutionKind: ResolutionKindSchema,
})
export type UntypedResolutionProblem = Schema.Schema.Type<typeof UntypedResolutionProblemSchema>

export const FalseESMProblemSchema = Schema.Struct({
  kind: Schema.Literal('FalseESM'),
  typesFileName: Schema.NonEmptyString,
  implementationFileName: Schema.NonEmptyString,
  typesModuleKind: ModuleKindSchema,
  implementationModuleKind: ModuleKindSchema,
})
export type FalseESMProblem = Schema.Schema.Type<typeof FalseESMProblemSchema>

export const FalseCJSProblemSchema = Schema.Struct({
  kind: Schema.Literal('FalseCJS'),
  typesFileName: Schema.NonEmptyString,
  implementationFileName: Schema.NonEmptyString,
  typesModuleKind: ModuleKindSchema,
  implementationModuleKind: ModuleKindSchema,
})
export type FalseCJSProblem = Schema.Schema.Type<typeof FalseCJSProblemSchema>

export const CJSResolvesToESMProblemSchema = Schema.Struct({
  kind: Schema.Literal('CJSResolvesToESM'),
  entrypoint: Schema.NonEmptyString,
  resolutionKind: ResolutionKindSchema,
})
export type CJSResolvesToESMProblem = Schema.Schema.Type<typeof CJSResolvesToESMProblemSchema>

export const NamedExportsProblemSchema = Schema.Struct({
  kind: Schema.Literal('NamedExports'),
  typesFileName: Schema.NonEmptyString,
  implementationFileName: Schema.NonEmptyString,
  isMissingAllNamed: Schema.Boolean.pipe(Schema.brand('IsMissingAllNamed')),
  missing: Schema.Array(Schema.String),
})
export type NamedExportsProblem = Schema.Schema.Type<typeof NamedExportsProblemSchema>

export const FallbackConditionProblemSchema = Schema.Struct({
  kind: Schema.Literal('FallbackCondition'),
  entrypoint: Schema.NonEmptyString,
  resolutionKind: ResolutionKindSchema,
})
export type FallbackConditionProblem = Schema.Schema.Type<typeof FallbackConditionProblemSchema>

export const FalseExportDefaultProblemSchema = Schema.Struct({
  kind: Schema.Literal('FalseExportDefault'),
  typesFileName: Schema.NonEmptyString,
  implementationFileName: Schema.NonEmptyString,
})
export type FalseExportDefaultProblem = Schema.Schema.Type<typeof FalseExportDefaultProblemSchema>

export const MissingExportEqualsProblemSchema = Schema.Struct({
  kind: Schema.Literal('MissingExportEquals'),
  typesFileName: Schema.NonEmptyString,
  implementationFileName: Schema.NonEmptyString,
})
export type MissingExportEqualsProblem = Schema.Schema.Type<typeof MissingExportEqualsProblemSchema>

export const InternalResolutionErrorProblemSchema = Schema.Struct({
  kind: Schema.Literal('InternalResolutionError'),
  fileName: Schema.NonEmptyString,
  pos: Schema.Int,
  end: Schema.Int,
  resolutionOption: ResolutionOptionSchema,
  moduleSpecifier: Schema.NonEmptyString,
  resolutionMode: ModuleKindSyntaxSchema,
  trace: Schema.Array(Schema.String),
})
export type InternalResolutionErrorProblem = Schema.Schema.Type<typeof InternalResolutionErrorProblemSchema>

export const UnexpectedModuleSyntaxProblemSchema = Schema.Struct({
  kind: Schema.Literal('UnexpectedModuleSyntax'),
  fileName: Schema.NonEmptyString,
  pos: Schema.Int,
  end: Schema.Int,
  syntax: ModuleKindSyntaxSchema,
  moduleKind: ModuleKindSchema,
})
export type UnexpectedModuleSyntaxProblem = Schema.Schema.Type<typeof UnexpectedModuleSyntaxProblemSchema>

export const CJSOnlyExportsDefaultProblemSchema = Schema.Struct({
  kind: Schema.Literal('CJSOnlyExportsDefault'),
  fileName: Schema.NonEmptyString,
  pos: Schema.Int,
  end: Schema.Int,
})
export type CJSOnlyExportsDefaultProblem = Schema.Schema.Type<typeof CJSOnlyExportsDefaultProblemSchema>

export const ProblemSchema = Schema.Union([
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
])
export type Problem = Schema.Schema.Type<typeof ProblemSchema>
