import { createRuleTester } from './_tester.js'

import {
  actualWithSuspends,
  EXPECTED,
  FIX,
  NAME,
  UNBUDGETED_ACTUAL,
  UNBUDGETED_EXPECTED,
  UNBUDGETED_FIX,
  UNBUDGETED_NAME,
} from '../schema-recursive-union-budget.config.js'
import { schemaRecursiveUnionBudget } from '../schema-recursive-union-budget.js'

const ruleTester = createRuleTester()

const DOMAIN_FILE = '/repo/pkg/src/domain.schema.ts'

const budgetError = (count: number) => ({
  messageId: 'recursiveUnionBudget',
  data: { name: NAME, expected: EXPECTED, actual: actualWithSuspends(count), fix: FIX },
})

const unbudgetedError = () => ({
  messageId: 'unbudgetedRecursionUnion',
  data: {
    name: UNBUDGETED_NAME,
    expected: UNBUDGETED_EXPECTED,
    actual: UNBUDGETED_ACTUAL,
    fix: UNBUDGETED_FIX,
  },
})

const cyclicUnion = (count: number): string => {
  const branches = Array.from({ length: count }, (_element, index) => `Branch${index + 1}`)
  return [
    `import { Schema as S } from 'effect'`,
    ``,
    `export interface Expr {`,
    `  readonly type: string`,
    `  readonly next: Expr`,
    `}`,
    ``,
    `let ExprSchema: S.Schema<Expr>`,
    ``,
    ...branches.map(
      (branch, index) =>
        `export const ${branch}: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b${
          index + 1
        }'), next: ExprSchema }))`,
    ),
    ``,
    `ExprSchema = S.Union([${branches.join(', ')}])`,
  ].join('\n')
}

const IGNORER_AST_NODE_UNION = `import { Schema as S } from 'effect'

export const Identifier = S.Struct({
  type: S.Literal('Identifier'),
  name: S.String,
})

export const StringLiteral = S.Struct({
  type: S.Literal('Literal'),
  value: S.String,
})

export const UnknownNode = S.Struct({ type: S.String })

export interface MemberExpression {
  readonly type: 'MemberExpression'
  readonly object: AstNode
  readonly property: AstNode
}

export interface CallExpression {
  readonly type: 'CallExpression'
  readonly callee: AstNode
  readonly arguments: readonly AstNode[]
}

export type AstNode =
  | Identifier
  | StringLiteral
  | MemberExpression
  | CallExpression
  | UnknownNode

let AstNodeSchema: S.Schema<AstNode>

export const MemberExpression: S.Schema<MemberExpression> = S.suspend(
  (): S.Schema<MemberExpression> =>
    S.Struct({
      type: S.Literal('MemberExpression'),
      object: AstNodeSchema,
      property: AstNodeSchema,
    }),
)

export const CallExpression: S.Schema<CallExpression> = S.suspend(
  (): S.Schema<CallExpression> =>
    S.Struct({
      type: S.Literal('CallExpression'),
      callee: AstNodeSchema,
      arguments: S.Array(AstNodeSchema),
    }),
)

AstNodeSchema = S.Union([
  Identifier,
  StringLiteral,
  MemberExpression,
  CallExpression,
  UnknownNode,
])

export const AstNode: S.Schema<AstNode> = AstNodeSchema`

const METRICS_RESULT_SCHEMA = `import * as S from 'effect/Schema'

export interface MetricsResult {
  readonly name: string
  readonly score: number
  readonly childResults: readonly MetricsResult[]
}

export const MetricsResultSchema = S.Struct({
  name: S.String,
  score: S.Finite,
  childResults: S.Array(S.suspend((): S.Codec<MetricsResult> => MetricsResultSchema)),
}).annotate({ identifier: 'MetricsResult' })`

const ENTRYPOINT_INFO_SCHEMA = `import { Schema } from 'effect'
import { EntrypointResolutionAnalysisSchema, ModuleKindSchema, ResolutionKindSchema } from './Problem.schema.js'

export const ProgramInfoSchema = Schema.Struct({
  moduleKinds: Schema.optional(Schema.Record(Schema.String, ModuleKindSchema)),
})

export const EntrypointInfoSchema = Schema.Struct({
  subpath: Schema.String,
  resolutions: Schema.Record(
    ResolutionKindSchema,
    Schema.suspend(() => EntrypointResolutionAnalysisSchema),
  ),
  hasTypes: Schema.Boolean,
  isWildcard: Schema.Boolean,
})`

const ANNOTATED_MEMBER_UNION = `import { Schema as S } from 'effect'

export interface Expr {
  readonly type: string
  readonly next: Expr
}

let ExprSchema: S.Schema<Expr>

export const Branch1: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b1'), next: ExprSchema }))
export const Branch2: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b2'), next: ExprSchema }))
export const Branch3: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b3'), next: ExprSchema }))
export const Branch4: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b4'), next: ExprSchema }))
export const Branch5: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b5'), next: ExprSchema }))
export const Branch6: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b6'), next: ExprSchema }))
export const Branch7: S.Schema<Expr> = S.suspend(() =>
  S.Struct({ type: S.Literal('b7'), next: ExprSchema }).annotate({ toArbitrary: () => (fc) => fc.constant({}) }),
)

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6, Branch7])`

const recursionPoint = (annotation: string): string =>
  `import { Schema as S } from 'effect'

export interface AstNode {
  readonly type: string
}

export const Identifier: S.Schema<AstNode> = S.Struct({ type: S.Literal('Identifier') })

export const AstNode: S.Schema<AstNode> = S.suspend(
  (): S.Schema<AstNode> => S.Union([Identifier, MemberExpression]),
)${annotation}

export const MemberExpression: S.Schema<AstNode> = S.Struct({
  type: S.Literal('MemberExpression'),
  object: AstNode,
})`

const LOCAL_BUILDER_UNION = `import { Schema as S } from 'effect'

export interface Expr {
  readonly type: string
  readonly next: Expr
}

let ExprSchema: S.Schema<Expr>

export const Leaf: S.Schema<Expr> = S.Struct({ type: S.Literal('Leaf'), next: S.Unknown })

const buildUnion = (members: readonly S.Schema<Expr>[]): S.Schema<Expr> => S.Union(members)

export const Branch1: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b1'), next: ExprSchema }))
export const Branch2: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b2'), next: ExprSchema }))
export const Branch3: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b3'), next: ExprSchema }))
export const Branch4: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b4'), next: ExprSchema }))
export const Branch5: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b5'), next: ExprSchema }))
export const Branch6: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b6'), next: ExprSchema }))

ExprSchema = buildUnion([Leaf, Branch1, Branch2, Branch3, Branch4, Branch5, Branch6])`

const DECLARE_TYPE_PARAMETER_SCHEMA = `import * as S from 'effect/Schema'

export interface Tree {
  readonly children: ReadonlyArray<Tree>
}

const isTree = (input: unknown): input is Tree => typeof input === 'object' && input !== null

export const TreeSchema: S.Schema<Tree> = S.declare<Tree>(isTree, { description: 'a tree' })`

const FOREIGN_SUSPEND_UNION = `import { Schema as S } from 'effect'
import { Union, suspend } from './local-builder.js'

export interface Expr {
  readonly next: Expr
}

let ExprSchema

export const Branch1 = suspend(() => S.Struct({ next: ExprSchema }))
export const Branch2 = suspend(() => S.Struct({ next: ExprSchema }))
export const Branch3 = suspend(() => S.Struct({ next: ExprSchema }))
export const Branch4 = suspend(() => S.Struct({ next: ExprSchema }))
export const Branch5 = suspend(() => S.Struct({ next: ExprSchema }))
export const Branch6 = suspend(() => S.Struct({ next: ExprSchema }))

ExprSchema = Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6])`

const NAMESPACE_MODULE_UNION = `import * as S from 'effect/Schema'

export interface Expr {
  readonly type: string
  readonly next: Expr
}

let ExprSchema: S.Schema<Expr>

export const Branch1 = S.suspend(() => S.Struct({ type: S.Literal('b1'), next: ExprSchema }))
export const Branch2 = S.suspend(() => S.Struct({ type: S.Literal('b2'), next: ExprSchema }))
export const Branch3 = S.suspend(() => S.Struct({ type: S.Literal('b3'), next: ExprSchema }))
export const Branch4 = S.suspend(() => S.Struct({ type: S.Literal('b4'), next: ExprSchema }))
export const Branch5 = S.suspend(() => S.Struct({ type: S.Literal('b5'), next: ExprSchema }))
export const Branch6 = S.suspend(() => S.Struct({ type: S.Literal('b6'), next: ExprSchema }))
export const Branch7 = S.suspend(() => S.Struct({ type: S.Literal('b7'), next: ExprSchema }))

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6, Branch7])`

const NAMED_IMPORT_UNION = `import { Literal, Struct, Union, suspend } from 'effect/Schema'

export interface Expr {
  readonly type: string
  readonly next: Expr
}

let ExprSchema: unknown

export const Branch1 = suspend(() => Struct({ type: Literal('b1'), next: ExprSchema }))
export const Branch2 = suspend(() => Struct({ type: Literal('b2'), next: ExprSchema }))
export const Branch3 = suspend(() => Struct({ type: Literal('b3'), next: ExprSchema }))
export const Branch4 = suspend(() => Struct({ type: Literal('b4'), next: ExprSchema }))
export const Branch5 = suspend(() => Struct({ type: Literal('b5'), next: ExprSchema }))
export const Branch6 = suspend(() => Struct({ type: Literal('b6'), next: ExprSchema }))

ExprSchema = Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6])`

ruleTester.run('schema-recursive-union-budget', schemaRecursiveUnionBudget, {
  valid: [
    {
      name: 'Should_StaySilent_When_CycleCarriesFiveSuspendMembers',
      code: cyclicUnion(5),
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_IgnorerAstNodeUnionIsVerbatim',
      code: IGNORER_AST_NODE_UNION,
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_SuspendSitsInsideTheDeclaredNode',
      code: METRICS_RESULT_SCHEMA,
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_TheCycleClosesAcrossFiles',
      code: ENTRYPOINT_INFO_SCHEMA,
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_MemberCarriesToArbitrary',
      code: ANNOTATED_MEMBER_UNION,
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_RecursionPointDeclaresItsBudget',
      code: recursionPoint(".annotate({ recursionBudget: { maxDepth: 6, depthSize: 'small' } })"),
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_RecursionPointCarriesItsOwnDerivation',
      code: recursionPoint('.annotate({ toArbitrary: () => (fc) => fc.constant({}) })'),
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_UnionIsBuiltByLocalBuilder',
      code: LOCAL_BUILDER_UNION,
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_RecursionLivesInADeclareTypeParameter',
      code: DECLARE_TYPE_PARAMETER_SCHEMA,
      filename: DOMAIN_FILE,
    },
    {
      name: 'Should_StaySilent_When_SuspendIsImportedFromAnotherModule',
      code: FOREIGN_SUSPEND_UNION,
      filename: DOMAIN_FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_CycleCarriesSevenSuspendMembers',
      code: cyclicUnion(7),
      filename: DOMAIN_FILE,
      errors: [budgetError(7)],
    },
    {
      name: 'Should_Report_When_CycleCarriesSixSuspendMembers',
      code: cyclicUnion(6),
      filename: DOMAIN_FILE,
      errors: [budgetError(6)],
    },
    {
      name: 'Should_Report_When_RecursionPointDeclaresNoBudget',
      code: recursionPoint(''),
      filename: DOMAIN_FILE,
      errors: [unbudgetedError()],
    },
    {
      name: 'Should_Report_When_RecursionPointAnnotatesOnlyItsIdentifier',
      code: recursionPoint(".annotate({ identifier: 'AstNode' })"),
      filename: DOMAIN_FILE,
      errors: [unbudgetedError()],
    },
    {
      name: 'Should_Report_When_SchemaModuleIsNamespaceImported',
      code: NAMESPACE_MODULE_UNION,
      filename: DOMAIN_FILE,
      errors: [budgetError(7)],
    },
    {
      name: 'Should_Report_When_SuspendAndUnionAreNamedImports',
      code: NAMED_IMPORT_UNION,
      filename: DOMAIN_FILE,
      errors: [budgetError(6)],
    },
  ],
})
