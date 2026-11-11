/**
 * @internal The one table of property run counts. A tier is decided from the environment record it is given, and
 * never by reading `process` here: the setup entry configures direct `Arbitrary` checks from it, and the engine
 * falls back to it when a run provides no budget.
 */
import type * as Arbitrary from 'effect/Arbitrary'

/** @internal */
export type Tier = 'mutation' | 'ci' | 'local'

type Env = Readonly<Record<string, string | undefined>>

const RUNS: Readonly<Record<Tier, number>> = { mutation: 30, ci: 1000, local: 100 }

// `CI` counts as set for any value except these: unset, empty, `false` and `0`.
const CI_OFF_VALUES: ReadonlyArray<string | undefined> = [undefined, '', 'false', '0']

// An agent run is never CI, whatever `CI` says, as the shared config has always decided.
const isCi = (env: Env): boolean => env['AGENT'] === undefined && !CI_OFF_VALUES.includes(env['CI'])

const isMutationWorker = (env: Env): boolean => env['STRYKER_MUTATOR_WORKER'] !== undefined

const ciOrLocal = (env: Env): Tier => (isCi(env) ? 'ci' : 'local')

/** @internal A Stryker worker wants fast mutant runs; CI wants the thorough tier; everything else is local. */
export const tierOf = (env: Env): Tier => (isMutationWorker(env) ? 'mutation' : ciOrLocal(env))

/**
 * @internal The check options direct `Arbitrary` checks use by default: `{ check: { runs } }` for the tier. A property
 * test that passes its own `runs` still wins over this default.
 */
export const propertyTestDefaults = (env: Env): Arbitrary.GlobalOptions => ({ check: { runs: RUNS[tierOf(env)] } })

/**
 * @internal The property budget a run uses when it provides none: the tier's runs, and no seed-store writes in CI or a
 * Stryker worker, where a checkout is discarded or a mutant run fails on purpose.
 */
export const providedBudgetOf = (env: Env): { readonly runs: number; readonly record?: boolean } => {
  const tier = tierOf(env)
  return tier === 'local' ? { runs: RUNS.local } : { runs: RUNS[tier], record: false }
}
