/**
 * The Vite plugin a Node `vitest.config.ts` lists in `plugins`, published as `@systemfsoftware/vitest/vite`. It
 * provides the run's property budget and reprints a refuted property's rerun line with the config the run loaded.
 *
 * @since 4.2.0
 */
import { NodeServices } from '@effect/platform-node'
import { Cause, Effect, Exit } from 'effect'
import type { Plugin, ViteUserConfig } from 'vitest/config'
import { budgetOf } from './internal/property/budget.js'
import { checkDefaultsKey, type PropertyBudget } from './internal/property/defaults.js'
import { gitHeadOf } from './internal/property/git-head.js'
import { replayWithLoadedConfig } from './internal/property/replay-reporter.js'

const processEnvironment = () => ({ ...process.env })

const testOf = (config: ViteUserConfig) => config.test ?? {}

const providedOf = (config: ViteUserConfig) => testOf(config).provide ?? {}

const provideOf = (budget: PropertyBudget): ViteUserConfig => ({ test: { provide: { [checkDefaultsKey]: budget } } })

// A budget the config provides itself wins over the tier's.
const configOf = (config: ViteUserConfig) =>
  providedOf(config)[checkDefaultsKey] === undefined
    ? budgetOf({ env: processEnvironment(), commit: gitHeadOf(process.cwd()) }).pipe(Effect.map(provideOf))
    : Effect.succeed({})

// A failed budget rejects with the failure's own rendering, so the run stops with its message.
const settled = <A, E>(exit: Exit.Exit<A, E>): Promise<A> =>
  Exit.isFailure(exit) ? Promise.reject(new Error(Cause.pretty(exit.cause))) : Promise.resolve(exit.value)

const added = new WeakSet<object>()

/**
 * Provides the property budget under `test.provide`, and registers the reporter that reprints a refuted property's
 * rerun line with `--config <the config file of the project that ran the test>`. List it in `plugins` of the config a
 * run loads, or of each project's config under `test.projects`.
 *
 * The budget is the tier's runs: 1000 on the CI tier, the mutation tier's inside a Stryker worker, 100 locally or under
 * an agent. Off the local tier it carries a seed from the checked-out commit (`git rev-parse HEAD`:
 * `parseInt(sha.slice(0, 8), 16)`, or 1 when that is 0) and no seed-store writes, so runs of one commit draw the
 * same cases. The local tier never reads git. A `test.provide` entry the config sets itself is kept.
 *
 * @since 4.2.0
 */
export const propertyTests = (): Plugin => ({
  name: '@systemfsoftware/vitest:property-tests',
  config: (config) => Effect.runPromiseExit(configOf(config).pipe(Effect.provide(NodeServices.layer))).then(settled),
  configureVitest: ({ vitest }) => {
    if (added.has(vitest)) return
    added.add(vitest)
    vitest.config.reporters.push(replayWithLoadedConfig(vitest))
  },
})
