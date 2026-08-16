import { it } from '@effect/vitest'
import { Exit, Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { FastCheck as fc } from 'effect/testing'
import { expectTypeOf } from 'vitest'
import { armsOf } from '../weaken.kernel.js'

/**
 * R2 in the only channel that can fire. The walk recurses through exactly the
 * container tags below — plus per-node checks and encoding links, which are
 * attached to any node rather than being AST tags of their own; every other
 * AST tag is a leaf that cannot hold a refinement. When Effect adds a tag,
 * this stops compiling and someone has to decide which side it belongs on.
 */
type WalkedTag = 'Declaration' | 'Suspend' | 'Arrays' | 'Objects' | 'Union'

expectTypeOf<Exclude<AST.AST['_tag'], WalkedTag>>().toEqualTypeOf<
  | 'Any'
  | 'BigInt'
  | 'Boolean'
  | 'Enum'
  | 'Literal'
  | 'Never'
  | 'Null'
  | 'Number'
  | 'ObjectKeyword'
  | 'String'
  | 'Symbol'
  | 'TemplateLiteral'
  | 'Undefined'
  | 'UniqueSymbol'
  | 'Unknown'
  | 'Void'
>()

/**
 * A construction recipe for a schema, and the arm count that construction
 * implies. The model is derived from the recipe, never re-walked from the
 * AST — a re-walk would only restate the implementation it is checking.
 */
type Recipe =
  | { readonly kind: 'leaf' }
  | { readonly kind: 'refine'; readonly inner: Recipe }
  | { readonly kind: 'transform'; readonly from: Recipe; readonly to: Recipe }
  | { readonly kind: 'struct'; readonly fields: readonly Recipe[] }
  | { readonly kind: 'sequence'; readonly element: Recipe }
  | { readonly kind: 'suspend'; readonly inner: Recipe }
  | { readonly kind: 'declaration'; readonly inner: Recipe }

const armCountOf = (recipe: Recipe): number => {
  if (recipe.kind === 'leaf') return 0
  if (recipe.kind === 'refine') return 1 + armCountOf(recipe.inner)
  if (recipe.kind === 'transform') return 2 + armCountOf(recipe.from) + armCountOf(recipe.to)
  if (recipe.kind === 'struct') return recipe.fields.reduce((n, f) => n + armCountOf(f), 0)
  if (recipe.kind === 'sequence') return armCountOf(recipe.element)
  if (recipe.kind === 'declaration') return armCountOf(recipe.inner)
  return armCountOf(recipe.inner)
}

const schemaOf = (recipe: Recipe): S.Codec<unknown, unknown> => {
  if (recipe.kind === 'leaf') return S.String
  if (recipe.kind === 'refine') return refineInto(recipe.inner, 1)
  if (recipe.kind === 'transform') {
    // v4 attaches an encoding link to the target node, and a `Suspend` target
    // carries the link on its wrapper — a shape `Schema.check` cannot refine.
    // The canonical recursive-transform spelling suspends the WHOLE transform,
    // putting the link on the inner node where refinement can reach it.
    if (recipe.to.kind === 'suspend') {
      const source = schemaOf(recipe.from)
      const target = schemaOf(recipe.to.inner)
      return S.suspend(() => source.pipe(S.decodeTo(target)))
    }
    return schemaOf(recipe.from).pipe(S.decodeTo(schemaOf(recipe.to)))
  }
  if (recipe.kind === 'struct') {
    const fields: Record<string, S.Codec<unknown, unknown>> = {}
    recipe.fields.forEach((f, i) => {
      fields[`f${i}`] = schemaOf(f)
    })
    return S.Struct(fields)
  }
  if (recipe.kind === 'sequence') return S.Array(schemaOf(recipe.element))
  if (recipe.kind === 'declaration') return S.Option(schemaOf(recipe.inner))
  return S.suspend(() => schemaOf(recipe.inner))
}

/**
 * A check cannot be attached to a `Suspend` node in v4, so a refinement chain
 * is pushed down through any suspensions and applied as one check layer on
 * the bottom-most node. The walk sees the same arm count either way. The
 * suspension can be recipe-level (`{kind: 'suspend'}`) or codec-level — a
 * transform whose target is itself suspended carries the whole encoding chain
 * under a `Suspend` root, and both shapes take the same push-down.
 */
const applyChecks = (schema: S.Codec<unknown, unknown>, depth: number): S.Codec<unknown, unknown> => {
  let checked = schema
  for (let i = 0; i < depth; i++) {
    checked = checked.pipe(S.check(S.makeFilter(() => true)))
  }
  return checked
}

const refineInto = (recipe: Recipe, depth: number): S.Codec<unknown, unknown> => {
  if (recipe.kind === 'refine') return refineInto(recipe.inner, depth + 1)
  if (recipe.kind === 'suspend') return S.suspend(() => refineInto(recipe.inner, depth))
  const base = schemaOf(recipe)
  if (base.ast instanceof AST.Suspend) {
    const inner = base.ast.thunk()
    return S.suspend(() => applyChecks(S.make(inner), depth))
  }
  return applyChecks(base, depth)
}

const recipeArb: fc.Arbitrary<Recipe> = fc.letrec<{ node: Recipe }>((tie) => ({
  node: fc.oneof(
    { maxDepth: 3 },
    fc.constant<Recipe>({ kind: 'leaf' }),
    tie('node').map((inner): Recipe => ({ kind: 'refine', inner })),
    fc.tuple(tie('node'), tie('node')).map(([from, to]): Recipe => ({ kind: 'transform', from, to })),
    fc.array(tie('node'), { minLength: 1, maxLength: 3 }).map((fields): Recipe => ({ kind: 'struct', fields })),
    tie('node').map((element): Recipe => ({ kind: 'sequence', element })),
    tie('node').map((inner): Recipe => ({ kind: 'suspend', inner })),
    tie('node').map((inner): Recipe => ({ kind: 'declaration', inner })),
  ),
})).node

it.prop('∀r_ArmCount_≡RecipeModel', [recipeArb], ([recipe]) => armsOf(schemaOf(recipe)).length === armCountOf(recipe))

it.prop('∀r_DistinctArmPaths_≡ArmCount', [recipeArb], ([recipe]) => {
  const arms = armsOf(schemaOf(recipe))
  return new Set(arms.map((a) => a.path)).size === arms.length
})

it.prop('∀r_EveryWeakened_≡Constructible', [recipeArb], ([recipe]) =>
  armsOf(schemaOf(recipe)).every((arm) => {
    const rebuilt = S.make(arm.weakened)
    return rebuilt.ast === arm.weakened
  }))

/**
 * `Union` stays out of the recipe grammar because Effect may collapse
 * structurally identical members, which would make the model wrong for a
 * reason that has nothing to do with the walk. Distinct thresholds keep every
 * member its own node.
 */
it.prop('∀n_UnionOfDistinctRefinements_≡NArms', [fc.integer({ min: 2, max: 6 })], ([members]) => {
  const branches = Array.from(
    { length: members },
    (_, i) => S.String.pipe(S.check(S.makeFilter((s: string) => s.length >= i))),
  )
  const arms = armsOf(S.Union(branches)).filter((a) => a.kind === 'drop-refinement')
  return arms.length === members
})

/**
 * Monotonicity: dropping a refinement only ever adds acceptance. The value is
 * generated long enough to satisfy every threshold, so the antecedent holds by
 * construction and the implication is never vacuous.
 */
const lengthRefinements = fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 4 })
  .chain((thresholds) => {
    const longest = Math.max(...thresholds)
    return fc.tuple(
      fc.constant(thresholds),
      fc.string({ minLength: longest, maxLength: longest + 4 }),
    )
  })

it.prop('∀tv_DropRefinement_⊇Original', [lengthRefinements], ([[thresholds, value]]) => {
  const schema = thresholds.reduce<S.Codec<string, string>>(
    (acc, min) => acc.pipe(S.check(S.makeFilter((s: string) => s.length >= min))),
    S.String,
  )
  const originalAccepts = Exit.isSuccess(S.decodeExit(schema)(value))
  const weakenedAllAccept = armsOf(schema)
    .filter((arm) => arm.kind === 'drop-refinement')
    .every((arm) =>
      Exit.isSuccess(S.decodeUnknownExit(S.make<S.ConstraintCodec<unknown, unknown>>(arm.weakened))(value))
    )
  return originalAccepts && weakenedAllAccept
})

/**
 * R3: obligations are keyed by the node an arm removes, so one refinement
 * reached by many paths is one node. Reference equality is the mechanism.
 */
it.prop('∀n_SharedRefinement_≡OneNode', [fc.integer({ min: 2, max: 5 })], ([positions]) => {
  const shared = S.String.pipe(S.check(S.makeFilter((s: string) => s.length > 0)))
  const fields: Record<string, S.Codec<unknown, unknown>> = {}
  for (let i = 0; i < positions; i++) fields[`f${i}`] = shared
  const arms = armsOf(S.Struct(fields)).filter((a) => a.kind === 'drop-refinement')
  return arms.length === positions && new Set(arms.map((a) => a.node)).size === 1
})
