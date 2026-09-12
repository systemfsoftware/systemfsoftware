import { it } from '@effect/vitest'
import { Schema as S, SchemaAST } from 'effect'
import { FastCheck as fc } from 'effect/testing'

const SAMPLE_DRAWS = 2000
const SAMPLE_SEEDS = 3

const STOCK_MAX_DEPTH = 2

const DEEP_DEPTH = STOCK_MAX_DEPTH + 2

const CALIBRATION_DRAWS = 512
const CALIBRATION_RUNS = 5
const SAFETY = 256
const BACKSTOP_FACTOR = 2
const CALIBRATION_SEED = 0xC0FFEE

const medianMs = (timings: ReadonlyArray<number>): number => {
  const ordered = [...timings].sort((left, right) => left - right)
  return ordered[ordered.length >> 1] ?? 0
}

const measureDrawMs = (arbitrary: fc.Arbitrary<unknown>): number => {
  const timings = Array.from({ length: CALIBRATION_RUNS }, () => {
    const started = performance.now()
    fc.sample(arbitrary, { numRuns: CALIBRATION_DRAWS, seed: CALIBRATION_SEED })
    return performance.now() - started
  })
  const median = medianMs(timings)
  if (median <= 0) throw new Error('recursionLaws calibration measured zero cost — clock unavailable')
  return median
}

const budgetCache = new WeakMap<fc.Arbitrary<unknown>, number>()

const budgetMsFor = (arbitrary: fc.Arbitrary<unknown>): number => {
  const cached = budgetCache.get(arbitrary)
  if (cached !== undefined) return cached
  const budget = measureDrawMs(arbitrary) * ((SAMPLE_DRAWS * SAMPLE_SEEDS) / CALIBRATION_DRAWS) * SAFETY
  budgetCache.set(arbitrary, budget)
  return budget
}

const lawOptionsFor = (arbitrary: fc.Arbitrary<unknown>) => {
  const budget = budgetMsFor(arbitrary)
  return {
    timeout: budget * BACKSTOP_FACTOR,
    fastCheck: { numRuns: SAMPLE_SEEDS, interruptAfterTimeLimit: budget, markInterruptAsFailure: true },
  } as const
}

const budgetOf = (ast: SchemaAST.AST): { readonly maxDepth: number } | undefined => {
  const annotation: unknown = SchemaAST.resolve(ast)?.['recursionBudget']
  if (typeof annotation !== 'object' || annotation === null || !('maxDepth' in annotation)) return undefined
  const maxDepth: unknown = annotation['maxDepth']
  return typeof maxDepth === 'number' ? { maxDepth } : undefined
}

const hasDerivationHook = (ast: SchemaAST.AST): boolean => SchemaAST.resolve(ast)?.['toArbitrary'] !== undefined

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

const childAstsOf = (
  ast: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): ReadonlyArray<SchemaAST.AST> => {
  if (SchemaAST.isSuspend(ast)) return [resolveSuspend(ast, resolved)]
  if (SchemaAST.isUnion(ast)) return ast.types
  if (SchemaAST.isArrays(ast)) return [...ast.elements, ...ast.rest]
  if (SchemaAST.isObjects(ast)) {
    return [
      ...ast.propertySignatures.map((signature) => signature.type),
      ...ast.indexSignatures.map((signature) => signature.type),
    ]
  }
  if (SchemaAST.isDeclaration(ast)) return ast.typeParameters
  return []
}

const isRecursiveUnion = (
  union: SchemaAST.Union,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  const seen = new Set<SchemaAST.AST>()
  const reaches = (ast: SchemaAST.AST): boolean => {
    if (ast === union) return true
    if (seen.has(ast)) return false
    seen.add(ast)
    return childAstsOf(ast, resolved).some((child) => reaches(child))
  }
  return union.types.some((member) => reaches(member))
}

const firstRecursiveUnion = (ast: SchemaAST.AST): SchemaAST.Union | undefined => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  const seen = new Set<SchemaAST.AST>()
  const visit = (node: SchemaAST.AST): SchemaAST.Union | undefined => {
    if (seen.has(node)) return undefined
    seen.add(node)
    if (SchemaAST.isUnion(node) && isRecursiveUnion(node, resolved)) return node
    for (const child of childAstsOf(node, resolved)) {
      const found = visit(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  return visit(ast)
}

const isSuspensionOf = (root: SchemaAST.AST, union: SchemaAST.Union): boolean => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  return childAstsOf(root, resolved).includes(union)
}

const memberSchemaOf = (ast: SchemaAST.AST): S.Top => S.make<S.Top>(ast)

const maxNestingDepthOf = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce((deepest: number, element) => Math.max(deepest, maxNestingDepthOf(element)), 0)
  }
  if (typeof value === 'object' && value !== null) {
    return 1 + Object.values(value).reduce((deepest: number, child) => Math.max(deepest, maxNestingDepthOf(child)), 0)
  }
  return 0
}

const sampledAt = (arbitrary: fc.Arbitrary<unknown>, seed: number): ReadonlyArray<unknown> =>
  fc.sample(arbitrary, { numRuns: SAMPLE_DRAWS, seed })

const deepShareOf = (sample: ReadonlyArray<unknown>): number =>
  sample.filter((value) => maxNestingDepthOf(value) >= DEEP_DEPTH).length / sample.length

const coversEveryVariant = (sample: ReadonlyArray<unknown>, members: ReadonlyArray<S.Top>): boolean =>
  members.every((member) => sample.some((value) => S.is(member)(value)))

export const recursionLaws = <A, I>(label: string, schema: S.Codec<A, I>): void => {
  const root = schema.ast
  const union = firstRecursiveUnion(root)
  const rootIsTheCycle = union !== undefined && (root === union || isSuspensionOf(root, union))
  if (union === undefined || !rootIsTheCycle) return
  const budget = budgetOf(root)
  if (budget !== undefined && !hasDerivationHook(root)) {
    throw new Error(
      `recursionBudget is declared on ${label} but nothing materialized it — Budget_RequiresTransform: register the recursion-budget Vite plugin in this package's vitest configuration`,
    )
  }
  const arbitrary = S.toArbitrary(schema)(fc)
  const members = union.types.map(memberSchemaOf)
  const maxDepth = budget?.maxDepth ?? STOCK_MAX_DEPTH

  it.prop(
    `∀x_${label}Nesting_≤MaxDepth1`,
    [arbitrary],
    ([value]) => maxNestingDepthOf(value) <= maxDepth + 1,
  )

  if (maxDepth > STOCK_MAX_DEPTH) {
    it.prop(
      `∀s_${label}DeepShare_≠Zero`,
      [S.toArbitrary(S.Int)(fc)],
      ([seed]) => deepShareOf(sampledAt(arbitrary, seed)) > 0,
      lawOptionsFor(arbitrary),
    )
  }

  it.prop(
    `∀s_${label}Variants_⊇Declared`,
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => coversEveryVariant(sampledAt(arbitrary, seed), members),
    lawOptionsFor(arbitrary),
  )
}
