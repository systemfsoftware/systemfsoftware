import { Match, Schema as S } from 'effect'
import { boundedUnion } from './bounded-union.kernel.js'

/**
 * The domain of `armsOf` / `obligationsOf` is *any Effect schema*, so the
 * generator must be a generator of schemas. The construction plan is declared
 * as a schema and the arbitrary is derived from it, so the generated domain and
 * the declared domain are the same set by construction. Expected counts come
 * from the plan, never from re-walking the AST — a re-walk would restate the
 * implementation under test.
 */
export type FixturePlainRecipe =
  | { readonly _tag: 'Leaf'; readonly refinements: 0 | 1 | 2 | 3 }
  | { readonly _tag: 'Struct'; readonly fields: ReadonlyArray<FixturePlainRecipe> }
  | { readonly _tag: 'Sequence'; readonly element: FixturePlainRecipe }

const Leaf = S.TaggedStruct('Leaf', { refinements: S.Literal(0, 1, 2, 3) })

/**
 * Each arm's witness search builds an arbitrary for the *whole* weakened schema,
 * so cost per recipe is (arms x WITNESS_BUDGET) draws of the entire tree. Depth
 * and fan-out are therefore magnitude knobs, not density ones: depth 1 with at
 * most two fields already produces the non-root refinements that root-only
 * schemas never exercise, which is the class this kernel exists to cover.
 */
const fields = <A>(inner: S.Schema<A, A, never>) => S.Array(inner)

const plainRecurse: S.Schema<FixturePlainRecipe> = S.suspend(() => FixturePlainRecipe)

export const FixturePlainRecipe: S.Schema<FixturePlainRecipe> = boundedUnion('FixturePlainRecipe', {
  base: [Leaf],
  maxDepth: 1,
  recur: [
    S.TaggedStruct('Struct', { fields: fields(plainRecurse) }),
    S.TaggedStruct('Sequence', { element: plainRecurse }),
  ],
})

export type FixtureRecipe =
  | { readonly _tag: 'Leaf'; readonly refinements: 0 | 1 | 2 | 3 }
  | { readonly _tag: 'Struct'; readonly fields: ReadonlyArray<FixtureRecipe> }
  | { readonly _tag: 'Sequence'; readonly element: FixtureRecipe }
  | { readonly _tag: 'Transform'; readonly from: FixtureRecipe; readonly to: FixtureRecipe }
  | { readonly _tag: 'Suspend'; readonly inner: FixtureRecipe }
  | { readonly _tag: 'Declaration'; readonly inner: FixtureRecipe }

const recipeRecurse: S.Schema<FixtureRecipe> = S.suspend(() => FixtureRecipe)

export const FixtureRecipe: S.Schema<FixtureRecipe> = boundedUnion('FixtureRecipe', {
  base: [Leaf],
  maxDepth: 1,
  recur: [
    S.TaggedStruct('Struct', { fields: fields(recipeRecurse) }),
    S.TaggedStruct('Sequence', { element: recipeRecurse }),
    S.TaggedStruct('Transform', { from: recipeRecurse, to: recipeRecurse }),
    S.TaggedStruct('Suspend', { inner: recipeRecurse }),
    S.TaggedStruct('Declaration', { inner: recipeRecurse }),
  ],
})

const structOf = (parts: ReadonlyArray<S.Schema.AnyNoContext>): S.Schema.AnyNoContext => {
  const fields: Record<string, S.Schema.AnyNoContext> = {}
  parts.forEach((part, i) => {
    fields[`f${i}`] = part
  })
  return S.Struct(fields)
}

/**
 * Each refinement on a leaf forbids one distinct string length. Distinctness is
 * what makes them logically independent, so dropping any single arm admits
 * exactly the length it forbade — a value the whole schema still rejects.
 * Comparable predicates would not work: under a stronger sibling the weaker
 * drop is vacuous and carries no witness at all.
 */
const forbidLengths = (count: number): S.Schema.AnyNoContext => {
  let schema: S.Schema.AnyNoContext = S.String
  for (let hole = 0; hole < count; hole++) {
    const forbidden = hole
    schema = schema.pipe(
      S.filter((value: unknown) => typeof value !== 'string' || value.length !== forbidden),
    )
  }
  return schema
}

const vacuousLeaf = (count: number): S.Schema.AnyNoContext => {
  let schema: S.Schema.AnyNoContext = S.String
  for (let i = 0; i < count; i++) schema = schema.pipe(S.filter(() => true))
  return schema
}

const build = (
  leafOf: (count: number) => S.Schema.AnyNoContext,
) =>
(recipe: FixtureRecipe): S.Schema.AnyNoContext => {
  const go = (node: FixtureRecipe): S.Schema.AnyNoContext =>
    Match.value(node).pipe(
      Match.tag('Leaf', (leaf) => leafOf(leaf.refinements)),
      Match.tag('Struct', (struct) => structOf(struct.fields.map(go))),
      Match.tag('Sequence', (sequence) => S.Array(go(sequence.element))),
      Match.tag('Transform', (transform) =>
        S.transform(go(transform.from), go(transform.to), {
          decode: (x: unknown) => x,
          encode: (x: unknown) => x,
          strict: false,
        })),
      Match.tag('Declaration', (declaration) => S.OptionFromSelf(go(declaration.inner))),
      Match.tag('Suspend', (suspend) => S.suspend(() => go(suspend.inner))),
      Match.exhaustive,
    )
  return go(recipe)
}

export const makeRestrictiveSchema = build(forbidLengths)
export const makeVacuousSchema = build(vacuousLeaf)
