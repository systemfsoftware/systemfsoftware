/**
 * @internal The property budget a Vitest config provides: the tier's budget from the one table in `tiers.ts`, and off
 * the local tier a seed derived from the commit, so every run of one commit draws the same cases.
 */
import type { PropertyBudget } from './defaults.js'
import { providedBudgetOf, tierOf } from './tiers.js'

/** @internal The environment record a tier is decided from. */
export type BudgetEnvironment = Readonly<Record<string, string | undefined>>

/** @internal The seed a commit names: its first eight hex digits, and 1 where those read as 0 or are not hex. */
export const seedOfCommit = (sha: string): number => Number.parseInt(sha.slice(0, 8), 16) || 1

/** @internal The checked-out commit, read from git. */
export const gitHead = (): string =>
  process.getBuiltinModule('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

/** @internal Where a budget reads its tier and its commit from. */
export interface BudgetSource {
  readonly env: () => BudgetEnvironment
  readonly commit: () => string
}

const processEnvironment = (): BudgetEnvironment => ({ ...(typeof process === 'undefined' ? undefined : process.env) })

/** @internal The process environment and the checked-out git commit. */
export const ambientSource: BudgetSource = { env: processEnvironment, commit: gitHead }

/** @internal */
export const budgetOf = (source: BudgetSource): PropertyBudget => {
  const env = source.env()
  return tierOf(env) !== 'local'
    ? { ...providedBudgetOf(env), seed: seedOfCommit(source.commit()) }
    : providedBudgetOf(env)
}
