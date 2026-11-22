/**
 * @internal The property budget a Vitest config provides: the tier's budget from the one table in `tiers.ts`, and off
 * the local tier a seed derived from the commit, so every run of one commit draws the same cases. The local tier never
 * reads the commit.
 */
import { Effect } from 'effect'
import type { PropertyBudget } from './defaults.js'
import { providedBudgetOf, tierOf } from './tiers.js'

/** @internal The environment record a tier is decided from. */
export type BudgetEnvironment = Readonly<Record<string, string | undefined>>

/** @internal The seed a commit names: its first eight hex digits, and 1 where those read as 0 or are not hex. */
export const seedOfCommit = (sha: string): number => Number.parseInt(sha.slice(0, 8), 16) || 1

const seeded = (env: BudgetEnvironment) => (sha: string): PropertyBudget => ({
  ...providedBudgetOf(env),
  seed: seedOfCommit(sha),
})

/** @internal `commit` runs only off the local tier. */
export const budgetOf = <E, R>(
  source: { readonly env: BudgetEnvironment; readonly commit: Effect.Effect<string, E, R> },
): Effect.Effect<PropertyBudget, E, R> =>
  tierOf(source.env) === 'local'
    ? Effect.succeed(providedBudgetOf(source.env))
    : Effect.map(source.commit, seeded(source.env))
