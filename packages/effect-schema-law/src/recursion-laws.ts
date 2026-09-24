/// <reference types="vitest/import-meta" />
import { it } from '@systemfsoftware/vitest'
import { Effect, Function, Schema as S, SchemaAST } from 'effect'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'

const SAMPLE_DRAWS = 2000
const TREE_SAMPLE_SEEDS = 3

const STOCK_MAX_DEPTH = 2

const DEEP_DEPTH = STOCK_MAX_DEPTH + 2

const budgetFromObject = (annotation: object | null): { readonly maxDepth: number } | undefined => {
  if (annotation === null) return undefined
  return maxDepthFromAnnotation(annotation)
}

const recursionBudgetAnnotation = (ast: SchemaAST.AST): unknown => SchemaAST.resolve(ast)?.['recursionBudget']

const numberBudget = (maxDepth: unknown): { readonly maxDepth: number } | undefined => {
  if (typeof maxDepth !== 'number') return undefined
  return { maxDepth }
}

const maxDepthFromAnnotation = (annotation: object): { readonly maxDepth: number } | undefined => {
  if (!('maxDepth' in annotation)) return undefined
  return numberBudget(annotation['maxDepth'])
}

const budgetOf = (ast: SchemaAST.AST): { readonly maxDepth: number } | undefined => {
  const annotation = recursionBudgetAnnotation(ast)
  if (typeof annotation !== 'object') return undefined
  return budgetFromObject(annotation)
}

const hasDerivationHook = (ast: SchemaAST.AST): boolean => SchemaAST.resolve(ast)?.['toCodecArbitrary'] !== undefined

const resolveSuspend = (
  ast: SchemaAST.Suspend,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.AST => {
  const memo = resolved.get(ast)
  if (memo !== undefined) return memo
  const thunked = ast.thunk()
  resolved.set(ast, thunked)
  return thunked
}

const childAstsFromSuspend = (
  ast: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isSuspend(ast)) return undefined
  return [resolveSuspend(ast, resolved)]
}

const childAstsFromUnion = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isUnion(ast)) return undefined
  return ast.types
}

const childAstsFromArrays = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isArrays(ast)) return undefined
  return [...ast.elements, ...ast.rest]
}

const childAstsFromObjects = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isObjects(ast)) return undefined
  return [
    ...ast.propertySignatures.map((signature) => signature.type),
    ...ast.indexSignatures.map((signature) => signature.type),
  ]
}

const childAstsFromDeclaration = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isDeclaration(ast)) return undefined
  return ast.typeParameters
}

const definedChildren = (
  left: ReadonlyArray<SchemaAST.AST> | undefined,
  right: ReadonlyArray<SchemaAST.AST> | undefined,
): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (left !== undefined) return left
  return right
}

const emptyChildren = (children: ReadonlyArray<SchemaAST.AST> | undefined): ReadonlyArray<SchemaAST.AST> => {
  if (children !== undefined) return children
  return []
}

const childAstsOf = (
  ast: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): ReadonlyArray<SchemaAST.AST> =>
  emptyChildren(
    definedChildren(
      definedChildren(
        definedChildren(childAstsFromSuspend(ast, resolved), childAstsFromUnion(ast)),
        definedChildren(childAstsFromArrays(ast), childAstsFromObjects(ast)),
      ),
      childAstsFromDeclaration(ast),
    ),
  )

const reachesUnseen = (
  ast: SchemaAST.AST,
  union: SchemaAST.Union,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  if (seen.has(ast)) return false
  seen.add(ast)
  return childAstsOf(ast, resolved).some((child) => reachesUnion(child, union, seen, resolved))
}

const reachesUnion = (
  ast: SchemaAST.AST,
  union: SchemaAST.Union,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  if (ast === union) return true
  return reachesUnseen(ast, union, seen, resolved)
}

const isRecursiveUnion = (
  union: SchemaAST.Union,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  const seen = new Set<SchemaAST.AST>()
  return union.types.some((member) => reachesUnion(member, union, seen, resolved))
}

const recursiveUnionOrUndefined = (
  node: SchemaAST.Union,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  if (!isRecursiveUnion(node, resolved)) return undefined
  return node
}

const unionIfRecursive = (
  node: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  if (!SchemaAST.isUnion(node)) return undefined
  return recursiveUnionOrUndefined(node, resolved)
}

const unionOrNextChild = (
  found: SchemaAST.Union | undefined,
  rest: ReadonlyArray<SchemaAST.AST>,
  visit: (node: SchemaAST.AST) => SchemaAST.Union | undefined,
): SchemaAST.Union | undefined => {
  if (found !== undefined) return found
  return firstChildUnion(rest, visit)
}

const firstChildUnion = (
  children: ReadonlyArray<SchemaAST.AST>,
  visit: (node: SchemaAST.AST) => SchemaAST.Union | undefined,
): SchemaAST.Union | undefined => {
  const [child, ...rest] = children
  if (child === undefined) return undefined
  return unionOrNextChild(visit(child), rest, visit)
}

const visitMarked = (
  node: SchemaAST.AST,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  seen.add(node)
  const here = unionIfRecursive(node, resolved)
  if (here !== undefined) return here
  return firstChildUnion(childAstsOf(node, resolved), (child) => visitUnseen(child, seen, resolved))
}

const visitUnseen = (
  node: SchemaAST.AST,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  if (seen.has(node)) return undefined
  return visitMarked(node, seen, resolved)
}

const firstRecursiveUnion = (ast: SchemaAST.AST): SchemaAST.Union | undefined => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  const seen = new Set<SchemaAST.AST>()
  return visitUnseen(ast, seen, resolved)
}

const isSuspensionOf = (root: SchemaAST.AST, union: SchemaAST.Union): boolean => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  return childAstsOf(root, resolved).includes(union)
}

const memberSchemaOf = (ast: SchemaAST.AST): S.Top => S.make<S.Top>(ast)

const maxDepthAmong = (values: ReadonlyArray<unknown>): number =>
  values.reduce((deepest: number, element) => Math.max(deepest, maxNestingDepthOf(element)), 0)

const objectNestingDepth = (value: object): number => 1 + maxDepthAmong(Object.values(value))

const objectNestingDepthOrNull = (value: object | null): number => {
  if (value === null) return 0
  return objectNestingDepth(value)
}

const objectDepthIfObject = (value: unknown): number => {
  if (typeof value !== 'object') return 0
  return objectNestingDepthOrNull(value)
}

const maxNestingDepthOf = (value: unknown): number => {
  if (Array.isArray(value)) return maxDepthAmong(value)
  return objectDepthIfObject(value)
}

const sampledAt = (
  arbitrary: Arbitrary.Arbitrary<unknown>,
  seed: number,
  size: number,
): Effect.Effect<ReadonlyArray<unknown>, Arbitrary.SampleError> =>
  Arbitrary.sampleEffect(arbitrary, { count: SAMPLE_DRAWS, seed, size })

const deepShareOf = (sample: ReadonlyArray<unknown>): number =>
  sample.filter((value) => maxNestingDepthOf(value) >= DEEP_DEPTH).length / sample.length

const coversEveryVariant = (sample: ReadonlyArray<unknown>, members: ReadonlyArray<S.Top>): boolean =>
  members.every((member) => sample.some((value) => S.is(member)(value)))

const isUnionAtRoot = (root: SchemaAST.AST, union: SchemaAST.Union): boolean => {
  if (root === union) return true
  return isSuspensionOf(root, union)
}

const isRootCycle = (root: SchemaAST.AST, union: SchemaAST.Union | undefined): union is SchemaAST.Union => {
  if (union === undefined) return false
  return isUnionAtRoot(root, union)
}

const rootCycleUnion = (root: SchemaAST.AST): SchemaAST.Union | undefined => {
  const union = firstRecursiveUnion(root)
  if (!isRootCycle(root, union)) return undefined
  return union
}

const throwIfMissingHook = (label: string, root: SchemaAST.AST): void => {
  if (hasDerivationHook(root)) return
  throw new Error(
    `recursionBudget is declared on ${label} but nothing materialized it — Budget_RequiresTransform: register the recursion-budget Vite plugin in this package's vitest configuration`,
  )
}

const assertDerivationHook = (
  label: string,
  root: SchemaAST.AST,
  budget: { readonly maxDepth: number } | undefined,
): void => {
  if (budget === undefined) return
  throwIfMissingHook(label, root)
}

const maxDepthOfBudget = (budget: { readonly maxDepth: number } | undefined): number => {
  if (budget === undefined) return STOCK_MAX_DEPTH
  return budget.maxDepth
}

const coversMemberOf = (
  members: ReadonlyArray<S.Top>,
): (sample: ReadonlyArray<unknown>) => boolean =>
(sample) => coversEveryVariant(sample, members)

type RecursionSubject = {
  readonly sample: (seed: number) => Effect.Effect<ReadonlyArray<unknown>, Arbitrary.SampleError>
  readonly depth: (value: unknown) => number
  readonly deepShare: (sample: ReadonlyArray<unknown>) => number
  readonly covers: (sample: ReadonlyArray<unknown>) => boolean
}

const recursionSubjectOf = (
  arbitrary: Arbitrary.Arbitrary<unknown>,
  members: ReadonlyArray<S.Top>,
  maxDepth: number,
): RecursionSubject => ({
  sample: (seed: number) => sampledAt(arbitrary, seed, maxDepth),
  depth: maxNestingDepthOf,
  deepShare: deepShareOf,
  covers: coversMemberOf(members),
})

const registerDeepShareLaw = (
  label: string,
  recursionSubject: RecursionSubject,
  maxDepth: number,
): void => {
  if (maxDepth <= STOCK_MAX_DEPTH) return
  it.effect.prop(
    `∀s_${label}DeepShare_≠Zero`,
    { of: [S.Int], subject: recursionSubject, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) => subject.sample(seed).pipe(Effect.map((sample) => subject.deepShare(sample) > 0)),
  )
}

export const recursionLaws: {
  (label: string): <A, I>(schema: S.Codec<A, I>) => void
  <A, I>(label: string, schema: S.Codec<A, I>): void
} = Function.dual(
  2,
  <A, I>(label: string, schema: S.Codec<A, I>): void => {
    const root = schema.ast
    const union = rootCycleUnion(root)
    if (union === undefined) return
    const budget = budgetOf(root)
    assertDerivationHook(label, root, budget)
    const arbitrary = Arbitrary.schema(schema)
    const members = union.types.map(memberSchemaOf)
    const maxDepth = maxDepthOfBudget(budget)
    const recursionSubject = recursionSubjectOf(arbitrary, members, maxDepth)

    it.prop(
      `∀x_${label}Nesting_≤MaxDepth1`,
      { of: [arbitrary], subject: recursionSubject, runs: TREE_SAMPLE_SEEDS },
      (subject, [value]) => subject.depth(value) <= maxDepth + 1,
    )

    registerDeepShareLaw(label, recursionSubject, maxDepth)

    it.effect.prop(
      `∀s_${label}Variants_⊇Declared`,
      { of: [S.Int], subject: recursionSubject, runs: TREE_SAMPLE_SEEDS },
      (subject, [seed]) => subject.sample(seed).pipe(Effect.map((sample) => subject.covers(sample))),
    )

    it.prop(
      `∀v_${label}_DepthPlusOne`,
      { of: [arbitrary], subject: recursionSubject, runs: TREE_SAMPLE_SEEDS },
      (subject, [value]) => subject.depth({ v: value }) === subject.depth(value) + 1,
    )
  },
)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema: S, Exit } = await import('effect')
  type Codec = S.Codec<unknown, unknown>
  const MAX_DEPTH = 8
  const NESTING_CAP = MAX_DEPTH + 1
  const DeepChain = S.Int.pipe(S.check(S.isBetween({ minimum: NESTING_CAP + 1, maximum: NESTING_CAP + 20 })))

  const Lit = S.TaggedStruct('Lit', { value: S.Finite })
  const Id = S.TaggedStruct('Id', { name: S.String })
  const Num = S.TaggedStruct('Num', { value: S.Finite })
  const Str = S.TaggedStruct('Str', { value: S.String })
  const Flag = S.TaggedStruct('Flag', { on: S.Boolean })

  const binaryOf = (recur: Codec): Codec => S.TaggedStruct('Binary', { left: recur, right: recur })
  const memberOf = (recur: Codec): Codec => S.TaggedStruct('Member', { object: recur, property: recur })
  const conditionalOf = (recur: Codec): Codec =>
    S.TaggedStruct('Conditional', { test: recur, consequent: recur, alternate: recur })
  const callOf = (recur: Codec): Codec => S.TaggedStruct('Call', { callee: recur, args: S.Array(recur) })

  const annotatedExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec => S.Union([Lit, Id, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    ).annotate({
      identifier: 'LawExpr',
      recursionBudget: { maxDepth: MAX_DEPTH, depthSize: 'medium' },
    })
    return Expr
  }

  const stockExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec => S.Union([Lit, Id, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    )
    return Expr
  }

  const ANNOTATED_EXPR = annotatedExpr()
  const STOCK_EXPR = stockExpr()

  const droppedMemberExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec => S.Union([Lit, Id, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    ).annotate({
      identifier: 'DroppedMemberExpr',
    })
    return Expr
  }

  const DROPPED_MEMBER_EXPR = droppedMemberExpr()

  const COLLAPSED_GENERATION = S.Union([Lit, Id])

  const arbitraryCache = new Map<S.Constraint, Arbitrary.Arbitrary<unknown>>()

  const arbitraryOf = (schema: S.Constraint): Arbitrary.Arbitrary<unknown> => {
    const cached = arbitraryCache.get(schema)
    if (cached !== undefined) return cached
    const arbitrary = Arbitrary.schema(schema)
    arbitraryCache.set(schema, arbitrary)
    return arbitrary
  }

  const sizeOf = (schema: S.Constraint): number => maxDepthOfBudget(budgetOf(schema.ast))

  const sampleOf = (schema: S.Constraint, seed: number) => sampledAt(arbitraryOf(schema), seed, sizeOf(schema))

  const declaredMembersOf = (schema: S.Constraint): ReadonlyArray<S.Top> => {
    const union = firstRecursiveUnion(schema.ast)
    if (union === undefined) return []
    return union.types.map(memberSchemaOf)
  }

  const declaredCapOf = (schema: S.Constraint): number => {
    const budget = budgetOf(schema.ast)
    if (budget === undefined) return STOCK_MAX_DEPTH + 1
    return budget.maxDepth + 1
  }

  const NON_RECURSIVE_SCHEMAS: ReadonlyArray<{ readonly ast: SchemaAST.AST }> = [
    S.String,
    S.Array(S.String),
    S.Struct({ a: S.String, b: S.String }),
    S.Struct({ outer: S.Struct({ inner: S.String }) }),
  ]

  const encodedChainOf = (depth: number): unknown => {
    let node: unknown = { _tag: 'Lit', value: 1 }
    for (let level = 1; level < depth; level += 1) {
      node = { _tag: 'Call', callee: node, args: [] }
    }
    return node
  }

  const decodedDepthOf = (depth: number): number => {
    const decoded = S.decodeUnknownExit(ANNOTATED_EXPR)(encodedChainOf(depth))
    if (!Exit.isSuccess(decoded)) return -1
    return maxNestingDepthOf(decoded.value)
  }

  const NonRecursiveIndex = S.Int.pipe(
    S.check(S.isBetween({ minimum: 0, maximum: NON_RECURSIVE_SCHEMAS.length - 1 })),
  )

  const IN_SOURCE_SUBJECT = {
    firstRecursiveUnion,
    decodedDepthOf,
    maxNestingDepthOf,
    deepShareOf,
    coversEveryVariant,
  }

  it.prop(
    '∀v_Measure_DepthPlusOne',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT },
    (subject, [value]) => subject.maxNestingDepthOf({ v: value }) === subject.maxNestingDepthOf(value) + 1,
  )

  it.prop(
    '∀s_NonRecursiveSchemas_⊥Cycle',
    { of: [NonRecursiveIndex], subject: IN_SOURCE_SUBJECT },
    (subject, [index]) => {
      const schema = NON_RECURSIVE_SCHEMAS[index]
      if (schema === undefined) return false
      return subject.firstRecursiveUnion(schema.ast) === undefined
    },
  )

  it.prop(
    '∀d_ChainPastCap_=Depth',
    { of: [DeepChain], subject: IN_SOURCE_SUBJECT },
    (subject, [depth]) => subject.decodedDepthOf(depth) === depth,
  )

  it.effect.prop(
    '∀s_StockExprDeepShare_=Zero',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) => sampleOf(STOCK_EXPR, seed).pipe(Effect.map((sample) => subject.deepShareOf(sample) === 0)),
  )

  it.effect.prop(
    '∀s_StockExprNesting_≤StockCap',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) =>
      sampleOf(STOCK_EXPR, seed).pipe(
        Effect.map((sample) => sample.every((value) => subject.maxNestingDepthOf(value) <= declaredCapOf(STOCK_EXPR))),
      ),
  )

  it.effect.prop(
    '∀s_DeclaredDeepShare_≠Zero',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) => sampleOf(ANNOTATED_EXPR, seed).pipe(Effect.map((sample) => subject.deepShareOf(sample) > 0)),
  )

  const baseHeavyExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec =>
        S.Union([Lit, Id, Num, Str, Flag, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    ).annotate({
      identifier: 'BaseHeavyExpr',
      recursionBudget: { maxDepth: MAX_DEPTH, depthSize: 'medium' },
    })
    return Expr
  }

  const BASE_HEAVY_EXPR = baseHeavyExpr()

  it.effect.prop(
    '∀s_BaseHeavyDeepShare_≠Zero',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) => sampleOf(BASE_HEAVY_EXPR, seed).pipe(Effect.map((sample) => subject.deepShareOf(sample) > 0)),
  )

  it.effect.prop(
    '∀s_CollapsedSubsetDeepShare_=Zero',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) =>
      sampleOf(COLLAPSED_GENERATION, seed).pipe(Effect.map((sample) => subject.deepShareOf(sample) === 0)),
  )

  it.effect.prop(
    '∀s_AnnotatedExprNesting_≤DeclaredCap',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) =>
      sampleOf(ANNOTATED_EXPR, seed).pipe(
        Effect.map((sample) =>
          sample.every((value) => subject.maxNestingDepthOf(value) <= declaredCapOf(ANNOTATED_EXPR))
        ),
      ),
  )

  it.effect.prop(
    '∀s_AnnotatedExprVariants_⊇Declared',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) =>
      sampleOf(ANNOTATED_EXPR, seed).pipe(
        Effect.map((sample) => subject.coversEveryVariant(sample, declaredMembersOf(ANNOTATED_EXPR))),
      ),
  )

  it.effect.prop(
    '∀s_CollapsedSubset_⊥FullUnionCoverage',
    { of: [S.Int], subject: IN_SOURCE_SUBJECT, runs: TREE_SAMPLE_SEEDS },
    (subject, [seed]) =>
      sampleOf(COLLAPSED_GENERATION, seed).pipe(
        Effect.map((sample) => !subject.coversEveryVariant(sample, declaredMembersOf(DROPPED_MEMBER_EXPR))),
      ),
  )
}
