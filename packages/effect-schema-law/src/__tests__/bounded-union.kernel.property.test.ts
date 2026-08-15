import { it } from '@effect/vitest'
import { Arbitrary, FastCheck as fc, Schema as S } from 'effect'
import { boundedUnion } from '../bounded-union.kernel.js'

/**
 * `ruleOfSchemas` covers a schema's codec laws; the arbitrary `boundedUnion`
 * annotates onto the union is covered here, and nowhere else. No seed is named
 * below — where a sample is unavoidable the seed is generated, so each property
 * is quantified over every seed rather than recorded at one.
 */

/**
 * The recursive members keep explicit type anchors: deriving a recursive type
 * from its schema const (`type Binary = S.Schema.Type<typeof Binary>` with the
 * const annotated `: S.Schema<Binary>`) is circular (TS2502/TS2456), and
 * leaving the const unannotated cannot be inferred (TS7022). The leaf members
 * derive from their consts; the recursive anchors are structurally identical
 * to the interfaces they replaced.
 */
type Binary = { readonly _tag: 'Binary'; readonly op: string; readonly left: Expr; readonly right: Expr }
type Member = { readonly _tag: 'Member'; readonly object: Expr; readonly property: Expr }
type Conditional = {
  readonly _tag: 'Conditional'
  readonly test: Expr
  readonly consequent: Expr
  readonly alternate: Expr
}
type Call = { readonly _tag: 'Call'; readonly callee: Expr; readonly args: readonly Expr[] }

type Expr = Lit | Id | Binary | Member | Conditional | Call

const Lit = S.TaggedStruct('Lit', { value: S.JsonNumber })
const Id = S.TaggedStruct('Id', { name: S.String })

const Binary: S.Schema<Binary> = S.suspend((): S.Schema<Binary> =>
  S.TaggedStruct('Binary', { op: S.String, left: Expr, right: Expr })
)
const Member: S.Schema<Member> = S.suspend((): S.Schema<Member> =>
  S.TaggedStruct('Member', { object: Expr, property: Expr })
)
const Conditional: S.Schema<Conditional> = S.suspend((): S.Schema<Conditional> =>
  S.TaggedStruct('Conditional', { test: Expr, consequent: Expr, alternate: Expr })
)
const Call: S.Schema<Call> = S.suspend((): S.Schema<Call> =>
  S.TaggedStruct('Call', { callee: Expr, args: S.Array(Expr) })
)

const BASE = [Lit, Id] as const
const RECUR = [Binary, Member, Conditional, Call] as const

const Expr: S.Schema<Expr> = boundedUnion('Expr', { base: BASE, recur: RECUR })

type Lit = S.Schema.Type<typeof Lit>
type Id = S.Schema.Type<typeof Id>

/**
 * The default `maxDepth` is 2, and depth counts recursive *descents*: a root
 * recur may bear a recur child, whose own children are forced to base. So the
 * deepest chain is recur -> recur -> leaf, and `nestingDepth` — which scores a
 * leaf 1 — tops out one above the cap.
 */
const DEPTH_CAP = 3

/**
 * At the root `fc.oneof` hands out five branches, the base pair counting as
 * one, so the rarest tag sits near 1/10 and 200 draws miss a given tag with
 * probability 0.9^200 ≈ 7e-10. The number to hold is this one, not a seed —
 * and the margin is thinner than it looks. Measured over 2000 seeds, a run of
 * 50 draws misses a tag 1.3% of the time, which `SEEDS` independent draws
 * compound into roughly one red in four per test run; the composition
 * property is only comfortably stable above about 100.
 */
const SAMPLE_SIZE = 200

/**
 * Seeds per sampling property. Breadth across seeds is what replaces the one
 * recorded seed the deleted snapshots pinned, and each seed costs
 * `SAMPLE_SIZE` generated values; 25 buys that breadth while keeping the file
 * under a fifth of a second.
 */
const SEEDS = 25

const VARIANT_COUNT = BASE.length + RECUR.length

/**
 * The base pair enters each level as ONE branch of that level's `fc.oneof`,
 * so the root's branches — the base pair, then each recur member — are evenly
 * weighted at `1 / (1 + RECUR.length)`. Measured over 3000 seeds the widest
 * per-branch drift was 0.115; the tolerance sits above that at about 5.3
 * binomial standard deviations, putting a false red near 1e-7 per seed.
 */
const EVEN_BRANCH_SHARE = 1 / (1 + RECUR.length)
const SHARE_TOLERANCE = 0.15

const sampleAt = (seed: number): readonly Expr[] => fc.sample(Arbitrary.make(Expr), { numRuns: SAMPLE_SIZE, seed })

const nestingDepth = (expr: Expr): number => {
  switch (expr._tag) {
    case 'Lit':
    case 'Id':
      return 1
    case 'Binary':
      return 1 + Math.max(nestingDepth(expr.left), nestingDepth(expr.right))
    case 'Member':
      return 1 + Math.max(nestingDepth(expr.object), nestingDepth(expr.property))
    case 'Conditional':
      return 1 + Math.max(
        nestingDepth(expr.test),
        nestingDepth(expr.consequent),
        nestingDepth(expr.alternate),
      )
    case 'Call':
      return 1 + Math.max(nestingDepth(expr.callee), ...expr.args.map(nestingDepth))
  }
}

const deepestOf = (samples: readonly Expr[]): number =>
  samples.reduce((deepest, sample) => Math.max(deepest, nestingDepth(sample)), 0)

const distinctTagsOf = (samples: readonly Expr[]): number => {
  const tags = new Set<Expr['_tag']>()
  for (const sample of samples) tags.add(sample._tag)
  return tags.size
}

const isBaseTag = (tag: Expr['_tag']): boolean => tag === 'Lit' || tag === 'Id'

/**
 * A branch is the base pair taken together, or one recur member. A branch that
 * never drew at all scores maximal drift rather than being skipped, so a
 * starved branch cannot hide by being absent from the tally.
 */
const widestBranchDriftOf = (samples: readonly Expr[]): number => {
  const drawn = new Map<string, number>()
  for (const sample of samples) {
    const branch = isBaseTag(sample._tag) ? 'base' : sample._tag
    drawn.set(branch, (drawn.get(branch) ?? 0) + 1)
  }
  if (drawn.size !== 1 + RECUR.length) return 1
  let widest = 0
  for (const count of drawn.values()) {
    const drift = Math.abs(count / samples.length - EVEN_BRANCH_SHARE)
    if (drift > widest) widest = drift
  }
  return widest
}

/**
 * Raising the default `maxDepth`, or dropping the `depthIdentifier` that makes
 * the cap shared rather than per-branch, lets a chain run past `DEPTH_CAP`.
 * Quantified over `Expr` itself, so fast-check's own bias and shrinking hunt
 * the deep cases rather than a seed deciding whether one appears.
 */
it.prop('∀e_ExprNesting_≤DepthCap', [Expr], ([expr]) => nestingDepth(expr) <= DEPTH_CAP)

/**
 * The cap must bind rather than the generator simply never recursing: a kernel
 * that lost its recur members, or capped a level short, still satisfies the
 * bound above while generating nothing but shallow values.
 */
it.prop(
  '∀s_ExprDeepest_=DepthCap',
  [fc.integer()],
  ([seed]) => deepestOf(sampleAt(seed)) === DEPTH_CAP,
  { fastCheck: { numRuns: SEEDS } },
)

/**
 * Every declared variant is reachable. This is the base/recur split's own
 * contract: mixing the base members in at each level is what `boundedUnion`
 * exists to do, and folding a member into the wrong list — or dropping it from
 * the `S.Union` the annotation rides on — makes one tag unreachable. Counting
 * distinct tags against the fixture's own arity means a seventh variant raises
 * the bar without this test being touched.
 */
it.prop(
  '∀s_ExprComposition_⊇AllTags',
  [fc.integer()],
  ([seed]) => distinctTagsOf(sampleAt(seed)) === VARIANT_COUNT,
  { fastCheck: { numRuns: SEEDS } },
)

/**
 * The mix stays even. This is the only property here that a *reweighting*
 * breaks: starving recursion, or over-weighting the base pair, leaves every
 * tag reachable and the depth cap intact, so the three properties above stay
 * green while generation quietly collapses toward leaves — and every consumer
 * that draws through `ruleOfSchemas` starts exercising shallow values only.
 * The deleted snapshot caught this with a recorded frequency histogram, which
 * could only do it by pinning the RNG stream; a drift bound catches the same
 * regression without naming a seed.
 */
it.prop(
  '∀s_ExprBranches_≤ShareTolerance',
  [fc.integer()],
  ([seed]) => widestBranchDriftOf(sampleAt(seed)) <= SHARE_TOLERANCE,
  { fastCheck: { numRuns: SEEDS } },
)
