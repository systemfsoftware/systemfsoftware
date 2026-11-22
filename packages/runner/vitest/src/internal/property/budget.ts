/** @internal The one owner of a run's property budget, for `it.prop`, recorded runs and direct checks alike. */
import type * as Arbitrary from 'effect/Arbitrary'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import type { PropertySettings } from '../../config.js'
import type { PropertyTier } from './budget.schema.js'
import type { PropertyBudget } from './defaults.js'

interface TierBudget {
  readonly runs: number
  readonly size: number
  readonly maxShrinks: number
}

const BUDGETS: Readonly<Record<PropertyTier, TierBudget>> = {
  replay: { runs: 100, size: 10, maxShrinks: 100 },
  mutation: { runs: 30, size: 10, maxShrinks: 100 },
  local: { runs: 100, size: 10, maxShrinks: 100 },
  ci: { runs: 1000, size: 10, maxShrinks: 100 },
  nightly: { runs: 10000, size: 10, maxShrinks: 100 },
}

const RECORDED: Readonly<Record<PropertyTier, boolean>> = {
  replay: false,
  mutation: false,
  local: true,
  ci: false,
  nightly: false,
}

const COMMIT_SEEDED: Readonly<Record<PropertyTier, boolean>> = {
  replay: false,
  mutation: true,
  local: false,
  ci: true,
  nightly: true,
}

const SEED_WITHOUT_COMMIT: Readonly<Record<PropertyTier, Option.Option<number>>> = {
  replay: Option.none(),
  mutation: Option.some(0),
  local: Option.none(),
  ci: Option.none(),
  nightly: Option.none(),
}

/** @internal */
export const seedOfCommit = (sha: string): number => Number.parseInt(sha.slice(0, 8), 16) >>> 0

const commitSeedOf = (tier: PropertyTier, commit: Option.Option<string>): Option.Option<number> =>
  Option.orElse(Option.map(commit, seedOfCommit), () => SEED_WITHOUT_COMMIT[tier])

const tierSeedOf = (tier: PropertyTier, commit: Option.Option<string>): Option.Option<number> =>
  COMMIT_SEEDED[tier] ? commitSeedOf(tier, commit) : Option.none()

const seedField = (seed: Option.Option<number>): { readonly seed?: number } =>
  Option.match(seed, { onNone: () => ({}), onSome: (value) => ({ seed: value }) })

// The run's settings name the commit when they carry one; the commit the plugin published fills in otherwise.
const commitOf = (settings: PropertySettings, published: Option.Option<string>): Option.Option<string> =>
  Option.orElse(settings.commit, () => published)

/** @internal */
export const tierBudgetOf: {
  (settings: PropertySettings, published: Option.Option<string>): PropertyBudget
  (published: Option.Option<string>): (settings: PropertySettings) => PropertyBudget
} = Function.dual(2, (settings: PropertySettings, published: Option.Option<string>): PropertyBudget => ({
  ...BUDGETS[settings.tier],
  record: RECORDED[settings.tier],
  ...seedField(tierSeedOf(settings.tier, commitOf(settings, published))),
}))

/** @internal */
export const withSeedOverride: {
  (budget: PropertyBudget, settings: PropertySettings): PropertyBudget
  (settings: PropertySettings): (budget: PropertyBudget) => PropertyBudget
} = Function.dual(
  2,
  (budget: PropertyBudget, settings: PropertySettings): PropertyBudget =>
    Option.match(settings.seed, { onNone: () => budget, onSome: (seed) => ({ ...budget, seed }) }),
)

const checkDefaults = (settings: PropertySettings, published: Option.Option<string>): Arbitrary.GlobalOptions => {
  const { runs, size, maxShrinks } = BUDGETS[settings.tier]
  const seed = Option.orElse(settings.seed, () => tierSeedOf(settings.tier, commitOf(settings, published)))
  return { check: { runs: Option.getOrElse(settings.runs, () => runs), size, maxShrinks, ...seedField(seed) } }
}

/** @internal */
export const checkDefaultsOf: {
  (settings: PropertySettings, published: Option.Option<string>): Arbitrary.GlobalOptions
  (published: Option.Option<string>): (settings: PropertySettings) => Arbitrary.GlobalOptions
} = Function.dual(2, checkDefaults)
