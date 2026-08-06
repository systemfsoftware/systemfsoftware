import { it } from '@effect/vitest'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { expectTypeOf } from 'vitest'
import { armsOf } from './weaken.kernel.js'

/**
 * R2 in the only channel that can fire. The walk recurses through exactly the
 * container tags below; every other AST tag is a leaf that cannot hold a
 * refinement. A runtime guard could not state this — it would mirror the walk
 * and never disagree with it. When Effect adds a tag, this stops compiling and
 * someone has to decide which side it belongs on.
 */
type WalkedTag = 'Declaration' | 'Refinement' | 'Suspend' | 'Transformation' | 'TupleType' | 'TypeLiteral' | 'Union'

expectTypeOf<Exclude<AST.AST['_tag'], WalkedTag>>().toEqualTypeOf<
  | 'AnyKeyword'
  | 'BigIntKeyword'
  | 'BooleanKeyword'
  | 'Enums'
  | 'Literal'
  | 'NeverKeyword'
  | 'NumberKeyword'
  | 'ObjectKeyword'
  | 'StringKeyword'
  | 'SymbolKeyword'
  | 'TemplateLiteral'
  | 'UndefinedKeyword'
  | 'UniqueSymbol'
  | 'UnknownKeyword'
  | 'VoidKeyword'
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

const schemaOf = (recipe: Recipe): S.Schema.AnyNoContext => {
  if (recipe.kind === 'leaf') return S.String
  if (recipe.kind === 'refine') return schemaOf(recipe.inner).pipe(S.filter(() => true))
  if (recipe.kind === 'transform') {
    return S.transform(schemaOf(recipe.from), schemaOf(recipe.to), {
      decode: (x: unknown) => x,
      encode: (x: unknown) => x,
      strict: false,
    })
  }
  if (recipe.kind === 'struct') {
    const fields: Record<string, S.Schema.AnyNoContext> = {}
    recipe.fields.forEach((f, i) => {
      fields[`f${i}`] = schemaOf(f)
    })
    return S.Struct(fields)
  }
  if (recipe.kind === 'sequence') return S.Array(schemaOf(recipe.element))
  if (recipe.kind === 'declaration') return S.OptionFromSelf(schemaOf(recipe.inner))
  return S.suspend(() => schemaOf(recipe.inner))
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
    (_, i) => S.String.pipe(S.filter((s: string) => s.length >= i)),
  )
  const arms = armsOf(S.Union(...branches)).filter((a) => a.kind === 'drop-refinement')
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
  const schema = thresholds.reduce<S.Schema<string, string, never>>(
    (acc, min) => acc.pipe(S.filter((s: string) => s.length >= min)),
    S.String,
  )
  const originalAccepts = Either.isRight(S.decodeUnknownEither(schema)(value))
  const weakenedAllAccept = armsOf(schema)
    .filter((arm) => arm.kind === 'drop-refinement')
    .every((arm) => Either.isRight(S.decodeUnknownEither(S.make(arm.weakened))(value)))
  return originalAccepts && weakenedAllAccept
})

/**
 * R3: obligations are keyed by the node an arm removes, so one refinement
 * reached by many paths is one node. Reference equality is the mechanism.
 */
it.prop('∀n_SharedRefinement_≡OneNode', [fc.integer({ min: 2, max: 5 })], ([positions]) => {
  const shared = S.String.pipe(S.filter((s: string) => s.length > 0))
  const fields: Record<string, S.Schema.AnyNoContext> = {}
  for (let i = 0; i < positions; i++) fields[`f${i}`] = shared
  const arms = armsOf(S.Struct(fields)).filter((a) => a.kind === 'drop-refinement')
  return arms.length === positions && new Set(arms.map((a) => a.node)).size === 1
})
