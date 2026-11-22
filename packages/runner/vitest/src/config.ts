/**
 * What a Node `vitest.config.ts` imports from this package, published as `@systemfsoftware/vitest/config`:
 * `propertyCheck()` for `test.provide`, and `propertyReplay()` for `plugins`. A test file imports the root entry
 * instead; nothing here belongs in a test.
 *
 * @since 4.2.0
 */
import type { Plugin } from 'vitest/config'
import { ambientSource, budgetOf, type BudgetSource } from './internal/property/budget.js'
import { checkDefaultsKey, type PropertyBudget } from './internal/property/defaults.js'
import { replayPlugin } from './internal/property/replay-reporter.js'

export type { BudgetSource }

/**
 * The property-check entry a Vitest config provides under `test.provide`, keyed by the name the runner reads:
 * the tier's runs, and off the local tier (CI, or a Stryker worker's mutation tier) a seed derived from the checked-out
 * commit (`git rev-parse HEAD`, so one commit draws the same cases wherever it runs) with no seed-store writes. A local
 * or agent run gets 100 runs, no seed. Pass a `source` of `env` and `commit` readers to decide from values other than
 * `process.env` and the checked-out git commit.
 *
 * @since 4.2.0
 */
export const propertyCheck = (
  source: BudgetSource = ambientSource,
): { readonly '@systemfsoftware/vitest:property-check': PropertyBudget } => ({
  [checkDefaultsKey]: budgetOf(source),
})

/**
 * A Vite plugin, listed in a Vitest config's `plugins`, that reprints a refuted property's rerun line with
 * `--config <the config file of the project that ran the test>`, written relative to the package directory the rerun
 * line runs from, so the rerun draws the budget the failing run drew.
 *
 * @since 4.2.0
 */
export const propertyReplay: () => Plugin = replayPlugin
