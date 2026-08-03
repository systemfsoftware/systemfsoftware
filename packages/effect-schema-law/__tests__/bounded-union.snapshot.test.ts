/**
 * boundedUnion — the recursion-bounded arbitrary is what this test pins.
 *
 * `boundedUnion` annotates an `S.Union` with a fast-check arbitrary that mixes
 * the base variants at every recursion level and caps the depth via
 * `fc.oneof({ depthIdentifier, maxDepth }, ...)`. The codec laws are already
 * covered by `ruleOfSchemas`; this snapshot test is the only place the
 * *arbitrary* itself is exercised, and a regression in the bounding — a
 * `maxDepth` default change, a base/recur mis-split, a missing
 * `depthIdentifier` — moves the snapshots that bound-depend.
 *
 * Everything sampled here is drawn under a fixed seed (`SEED`) and a fixed
 * run count so the resulting fixtures are byte-stable across runs and CI.
 *
 * What each test pins (and what would move the snapshot):
 * - Should_SampleTenRecursiveExprValues_When_UnderFixedSeed
 *     Bound: the depth cap AND the full Expr structure. Any change to
 *     boundedUnion, the schema definitions, or the fixed seed moves this.
 * - Should_DistributeAcrossTheSixTags_When_Run1000Times
 *     Bound: the union COMPOSITION (the six tags are the recur vs base split).
 *     A re-split between base/recur, adding/removing a variant, or changing
 *     the relative weights in the kernel's `fc.oneof` moves this. The depth
 *     cap itself does NOT — at 1000 samples the variant mix is independent
 *     of how deep any single sample can recurse.
 * - Should_CapObservedNestingDepth_When_BoundedUnionMaxDepthIs2
 *     Bound: the depth cap. `nestingDepth` counts the number of `_tag`-
 *     tagged edges from the root Expr to the deepest base leaf, so a leaf
 *     is depth 1 and the deepest sample under `maxDepth = 2` is depth 3
 *     (root recur → child recur → leaf). Changing the default `maxDepth`
 *     in `boundedUnion` moves both `maxObserved` and the per-sample
 *     distribution of depth values; the depth suite catches a missing
 *     `depthIdentifier` and a default-bound regression alike.
 */
import { Arbitrary, FastCheck as fc, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { boundedUnion } from '../src/mod.js'

const SEED = 1
const NUM_RUNS = 10
const DISTRIBUTION_RUNS = 1000
const MAX_DEPTH_OBSERVED_RUNS = 500

interface Lit {
  readonly _tag: 'Lit'
  readonly value: number
}
interface Id {
  readonly _tag: 'Id'
  readonly name: string
}
interface Binary {
  readonly _tag: 'Binary'
  readonly op: string
  readonly left: Expr
  readonly right: Expr
}
interface Member {
  readonly _tag: 'Member'
  readonly object: Expr
  readonly property: Expr
}
interface Conditional {
  readonly _tag: 'Conditional'
  readonly test: Expr
  readonly consequent: Expr
  readonly alternate: Expr
}
interface Call {
  readonly _tag: 'Call'
  readonly callee: Expr
  readonly args: ReadonlyArray<Expr>
}
type Expr = Lit | Id | Binary | Member | Conditional | Call
type Tag = Expr['_tag']

const Lit = S.Struct({ _tag: S.Literal('Lit'), value: S.JsonNumber })
const Id = S.Struct({ _tag: S.Literal('Id'), name: S.String })

const Binary: S.Schema<Binary> = S.suspend((): S.Schema<Binary> =>
  S.Struct({ _tag: S.Literal('Binary'), op: S.String, left: Expr, right: Expr })
)
const Member: S.Schema<Member> = S.suspend((): S.Schema<Member> =>
  S.Struct({ _tag: S.Literal('Member'), object: Expr, property: Expr })
)
const Conditional: S.Schema<Conditional> = S.suspend((): S.Schema<Conditional> =>
  S.Struct({ _tag: S.Literal('Conditional'), test: Expr, consequent: Expr, alternate: Expr })
)
const Call: S.Schema<Call> = S.suspend((): S.Schema<Call> =>
  S.Struct({ _tag: S.Literal('Call'), callee: Expr, args: S.Array(Expr) })
)

const Expr: S.Schema<Expr> = boundedUnion('Expr', {
  base: [Lit, Id],
  recur: [Binary, Member, Conditional, Call],
})

const sampleExpr = (numRuns: number): ReadonlyArray<Expr> => fc.sample(Arbitrary.make(Expr), { seed: SEED, numRuns })

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

const tagCounts = (samples: ReadonlyArray<Expr>): Record<Tag, number> => {
  const counts: Record<Tag, number> = { Lit: 0, Id: 0, Binary: 0, Member: 0, Conditional: 0, Call: 0 }
  for (const sample of samples) counts[sample._tag] += 1
  return counts
}

describe('boundedUnion — recursion-bounded arbitrary snapshot', () => {
  it('Should_SampleTenRecursiveExprValues_When_UnderFixedSeed', () => {
    const samples = sampleExpr(NUM_RUNS)
    expect(samples.map((sample) => JSON.stringify(sample))).toMatchSnapshot()
  })

  it('Should_DistributeAcrossTheSixTags_When_Run1000Times', () => {
    const distribution = sampleExpr(DISTRIBUTION_RUNS)
    expect(tagCounts(distribution)).toMatchSnapshot()
  })

  it('Should_CapObservedNestingDepth_When_BoundedUnionMaxDepthIs2', () => {
    const samples = sampleExpr(MAX_DEPTH_OBSERVED_RUNS)
    const observedDepths = samples.map(nestingDepth)
    const maxObserved = observedDepths.reduce((acc, depth) => Math.max(acc, depth), 0)
    expect({ maxObserved, distribution: observedDepths }).toMatchSnapshot()
  })
})
