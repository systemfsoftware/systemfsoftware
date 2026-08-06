import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { dischargedBy, obligationsOf, scanObligations } from './refutation.kernel.js'
import {
  FixturePlainRecipe,
  FixtureRecipe,
  makeRestrictiveSchema,
  makeVacuousSchema,
} from './schema-recipe.observer.js'

/**
 * The same shapes built with refinements that reject nothing: a weakening no
 * value can distinguish is not an obligation, however many arms the walk finds.
 */
it.prop(
  '∀r_VacuousRefinements_≡NoObligations',
  [FixturePlainRecipe],
  ([recipe]) => obligationsOf(makeVacuousSchema(recipe)).size === 0,
)

it.prop('∀r_EachWitness_≡DischargesItsOwnArm', [FixturePlainRecipe], ([recipe]) => {
  const schema = makeRestrictiveSchema(recipe)
  const obligations = obligationsOf(schema)
  return [...obligations.entries()].every(([node, obligation]) => {
    const credits = dischargedBy(schema, obligations, { W: fc.constant(obligation.witness) })
    return (credits.get(node) ?? []).includes('W')
  })
})

it.prop('∀r_NoGenerators_≡NoCredits', [FixturePlainRecipe], ([recipe]) => {
  const schema = makeRestrictiveSchema(recipe)
  const obligations = obligationsOf(schema)
  const credits = dischargedBy(schema, obligations, {})
  return [...obligations.keys()].every((node) => (credits.get(node) ?? []).length === 0)
})

it.prop(
  '∀r_ConstructibleSchema_≡NoBlindArms',
  [FixturePlainRecipe],
  ([recipe]) => scanObligations(makeRestrictiveSchema(recipe)).blind.length === 0,
)

/** Every obligation the scan reports is one `obligationsOf` returns — the scan is the total form. */
it.prop('∀r_ScanObligations_≡ObligationsOf', [FixtureRecipe], ([recipe]) => {
  const schema = makeRestrictiveSchema(recipe)
  return scanObligations(schema).obligations.size === obligationsOf(schema).size
})
