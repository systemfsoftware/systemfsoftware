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
  S.Struct({ type: S.Literal('b7'), next: ExprSchema }).annotate({ toCodecArbitrary: () => Schema.link() }),
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

// The cycle-closing edge is not a plain `=`: the rule must not treat the
// `||=` write as a module binding, so no cycle exists and nothing is reported.
const looseAssignmentUnion = (count: number): string =>
  cyclicUnion(count).replace('ExprSchema = S.Union(', 'ExprSchema ||= S.Union(')

// A sparse array gives `null` elements; the rule's AST walk must skip them.
const ARRAY_HOLE_BINDING = `import { Schema as S } from 'effect'

export const Marker: S.Schema<string> = S.Literal('marker')

export const holes = [Marker, , Marker]

void holes`

// A suspend member that reaches the union but is never referenced by it: it
// stands off the cycle and must not join the suspension count.
const STRAY_PREDECESSOR_UNION = `import { Schema as S } from 'effect'

export interface Expr {
  readonly type: string
  readonly next: Expr
}

let ExprSchema: S.Schema<Expr>

export const Stray: S.Schema<Expr> = S.suspend(() =>
  S.Struct({ type: S.Literal('stray'), next: ExprSchema, toCodecArbitrary: true }),
)

export const Branch1: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b1'), next: ExprSchema }))
export const Branch2: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b2'), next: ExprSchema }))
export const Branch3: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b3'), next: ExprSchema }))
export const Branch4: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b4'), next: ExprSchema }))
export const Branch5: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b5'), next: ExprSchema }))
export const Branch6: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b6'), next: ExprSchema }))

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6])`

// A suspend listed by the union that never reaches the union: on the reachable
// set, but not on the cycle, so it cannot count as a cycle member.
const STRAY_MEMBER_UNION = `import { Schema as S } from 'effect'

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

export const Stray: S.Schema<Expr> = S.suspend(() =>
  S.Struct({ type: S.Literal('stray'), toCodecArbitrary: true }),
)

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6, Stray])`

// A six-member cycle whose members are mostly not suspensions: only the four
// `suspend` members count against the threshold, so the cycle is silent.
const MIXED_MEMBERS_UNION = `import { Schema as S } from 'effect'

export interface Expr {
  readonly type: string
  readonly next: Expr
}

let ExprSchema: S.Schema<Expr>

export const Branch1: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b1'), next: ExprSchema }))
export const Branch2: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b2'), next: ExprSchema }))
export const Branch3: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b3'), next: ExprSchema }))
export const Branch4: S.Schema<Expr> = S.suspend(() => S.Struct({ type: S.Literal('b4'), next: ExprSchema }))

export const Plain5: S.Schema<Expr> = S.Struct({ type: S.Literal('p5'), next: ExprSchema })
export const Plain6: S.Schema<Expr> = S.Struct({ type: S.Literal('p6'), next: ExprSchema })

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Plain5, Plain6])`

// The derivation is named by a bare identifier: the annotation evidence is an
// `Identifier` node, and a seven-member cycle must stay silent.
const BARE_ANNOTATION_IDENTIFIER_UNION = `import { Schema as S } from 'effect'
import { toCodecArbitrary } from './derivation.js'

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
  S.Struct({ type: S.Literal('b7'), next: ExprSchema, marker: toCodecArbitrary }),
)

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6, Branch7])`

// The derivation is named by a member expression: the annotation evidence is a
// `MemberExpression` node, and a seven-member cycle must stay silent.
const MEMBER_ANNOTATION_UNION = `import { Schema as S } from 'effect'

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
  S.Struct({ type: S.Literal('b7'), next: ExprSchema, marker: S.toCodecArbitrary }),
)

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Branch6, Branch7])`

// The suspension thunk is a function expression with a block body, so the
// recursion point is only visible if the block's return statement is read.
const FUNCTION_EXPRESSION_RECURSION_POINT = `import { Schema as S } from 'effect'

export interface AstNode {
  readonly type: string
}

export const Identifier: S.Schema<AstNode> = S.Struct({ type: S.Literal('Identifier') })

export const AstNode: S.Schema<AstNode> = S.suspend(
  function (): S.Schema<AstNode> {
    return S.Union([Identifier, MemberExpression])
  },
)

export const MemberExpression: S.Schema<AstNode> = S.Struct({
  type: S.Literal('MemberExpression'),
  object: AstNode,
})`

// A bare `return` stands before the real one: only a return that carries an
// argument is the returned expression.
const BLOCK_BODY_RECURSION_POINT = `import { Schema as S } from 'effect'

export interface AstNode {
  readonly type: string
}

export const Identifier: S.Schema<AstNode> = S.Struct({ type: S.Literal('Identifier') })

export const AstNode: S.Schema<AstNode> = S.suspend(
  function (): S.Schema<AstNode> {
    return
    return S.Union([Identifier, MemberExpression])
  },
)

export const MemberExpression: S.Schema<AstNode> = S.Struct({
  type: S.Literal('MemberExpression'),
  object: AstNode,
})`

// A suspension that returns a union but is not part of a recursive cycle: it
// declares no budget, yet there is nothing to derive, so it stays silent.
const LONE_SUSPENSION_UNION = `import { Schema as S } from 'effect'

export const Identifier: S.Schema<string> = S.Struct({ type: S.Literal('Identifier') })

export const Lone: S.Schema<unknown> = S.suspend(() => S.Union([Identifier]))

void Lone`

// The suspension is a combinator that is not `suspend`: it recurses, but it is
// not the recursion point the rule keys on, so it stays silent.
const NON_SUSPEND_RECURSION_POINT = `import { Schema as S } from 'effect'

export const Identifier: S.Schema<unknown> = S.Struct({ type: S.Literal('Identifier'), ref: NotSuspend })

export const NotSuspend: S.Schema<unknown> = S.declare(() => S.Union([Identifier]))`

// One cycle that both carries six suspend members (a budget report) and holds a
// recursion point (an unbudgeted report): the already-reported cycle wins.
const MIXED_CYCLE_UNION = `import { Schema as S } from 'effect'

export interface Expr {
  readonly next: Expr
}

let ExprSchema: S.Schema<Expr>

export const Branch1: S.Schema<Expr> = S.suspend(() => S.Struct({ next: ExprSchema }))
export const Branch2: S.Schema<Expr> = S.suspend(() => S.Struct({ next: ExprSchema }))
export const Branch3: S.Schema<Expr> = S.suspend(() => S.Struct({ next: ExprSchema }))
export const Branch4: S.Schema<Expr> = S.suspend(() => S.Struct({ next: ExprSchema }))
export const Branch5: S.Schema<Expr> = S.suspend(() => S.Struct({ next: ExprSchema }))

export const Recursion: S.Schema<Expr> = S.suspend(() => S.Union([ExprSchema]))

ExprSchema = S.Union([Branch1, Branch2, Branch3, Branch4, Branch5, Recursion])`

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
      name: 'Should_StaySilent_When_MemberCarriesToCodecArbitrary',
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
      code: recursionPoint('.annotate({ toCodecArbitrary: () => Schema.link() })'),
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
    {
      // `||=` is not a plain assignment, so the union binding never enters the
      // index and no cycle is seen.
      name: 'Should_StaySilent_When_TheCycleClosingAssignmentIsNotAPlainAssignment',
      code: looseAssignmentUnion(7),
      filename: DOMAIN_FILE,
    },
    {
      // A sparse array's `null` hole is not an AST node and must be skipped.
      name: 'Should_StaySilent_When_AModuleScopeArrayCarriesAHole',
      code: ARRAY_HOLE_BINDING,
      filename: DOMAIN_FILE,
    },
    {
      // Only the `suspend` members of a cycle count, so a six-member cycle with
      // four suspensions is below the threshold.
      name: 'Should_StaySilent_When_TheCycleCarriesNonSuspendMembers',
      code: MIXED_MEMBERS_UNION,
      filename: DOMAIN_FILE,
    },
    {
      // The derivation is named by a bare identifier.
      name: 'Should_StaySilent_When_ADerivationIsNamedByABareIdentifier',
      code: BARE_ANNOTATION_IDENTIFIER_UNION,
      filename: DOMAIN_FILE,
    },
    {
      // The derivation is named by a member expression.
      name: 'Should_StaySilent_When_ADerivationIsNamedByAMemberExpression',
      code: MEMBER_ANNOTATION_UNION,
      filename: DOMAIN_FILE,
    },
    {
      // A suspension that returns a union outside any cycle is not a recursion
      // point the rule keys on.
      name: 'Should_StaySilent_When_ASuspendReturnsAUnionWithoutACycle',
      code: LONE_SUSPENSION_UNION,
      filename: DOMAIN_FILE,
    },
    {
      // The combinator that suspends is not `Schema.suspend`, so no budget is
      // owed even though the derivation recurses.
      name: 'Should_StaySilent_When_TheSuspensionComesFromANonSuspendCombinator',
      code: NON_SUSPEND_RECURSION_POINT,
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
    {
      name: 'Should_Report_When_TheCycleCarriesAStraySuspendPredecessor',
      code: STRAY_PREDECESSOR_UNION,
      filename: DOMAIN_FILE,
      errors: [budgetError(6)],
    },
    {
      name: 'Should_Report_When_TheUnionListsAStraySuspendMember',
      code: STRAY_MEMBER_UNION,
      filename: DOMAIN_FILE,
      errors: [budgetError(6)],
    },
    {
      name: 'Should_Report_When_TheBudgetIsDeclaredOutsideAnObjectArgument',
      code: recursionPoint('.annotate(() => ({ recursionBudget: { maxDepth: 6 } }))'),
      filename: DOMAIN_FILE,
      errors: [unbudgetedError()],
    },
    {
      name: 'Should_Report_When_TheSuspensionIsAFunctionExpression',
      code: FUNCTION_EXPRESSION_RECURSION_POINT,
      filename: DOMAIN_FILE,
      errors: [unbudgetedError()],
    },
    {
      name: 'Should_Report_When_TheThunkReturnsAUnionAfterABareReturn',
      code: BLOCK_BODY_RECURSION_POINT,
      filename: DOMAIN_FILE,
      errors: [unbudgetedError()],
    },
    {
      name: 'Should_Report_When_ABudgetedCycleAlsoHoldsARecursionPoint',
      code: MIXED_CYCLE_UNION,
      filename: DOMAIN_FILE,
      errors: [budgetError(6)],
    },
  ],
})
