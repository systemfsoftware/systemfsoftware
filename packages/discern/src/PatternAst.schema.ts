import { Schema } from 'effect'

export type PatternAst =
  | {
    readonly kind: 'Semantic'
    readonly id: string
    readonly decisionId: string
    readonly description?: string | undefined
  }
  | { readonly kind: 'Deterministic'; readonly id: string; readonly description?: string | undefined }
  | { readonly kind: 'And'; readonly patterns: ReadonlyArray<PatternAst> }
  | { readonly kind: 'Or'; readonly patterns: ReadonlyArray<PatternAst> }
  | { readonly kind: 'Not'; readonly pattern: PatternAst }

export const SemanticAst = Schema.Struct({
  kind: Schema.Literal('Semantic'),
  id: Schema.String,
  decisionId: Schema.String,
  description: Schema.optional(Schema.String),
})

export const DeterministicAst = Schema.Struct({
  kind: Schema.Literal('Deterministic'),
  id: Schema.String,
  description: Schema.optional(Schema.String),
})

export const AndAst = Schema.Struct({
  kind: Schema.Literal('And'),
  patterns: Schema.Array(Schema.suspend((): Schema.Codec<PatternAst> => PatternAst)),
})

export const OrAst = Schema.Struct({
  kind: Schema.Literal('Or'),
  patterns: Schema.Array(Schema.suspend((): Schema.Codec<PatternAst> => PatternAst)),
})

export const NotAst = Schema.Struct({
  kind: Schema.Literal('Not'),
  pattern: Schema.suspend((): Schema.Codec<PatternAst> => PatternAst),
})

export const PatternAst: Schema.Codec<PatternAst> = Schema.suspend((): Schema.Codec<PatternAst> =>
  Schema.Union([SemanticAst, DeterministicAst, AndAst, OrAst, NotAst])
).annotate({
  identifier: 'PatternAst',
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
})
