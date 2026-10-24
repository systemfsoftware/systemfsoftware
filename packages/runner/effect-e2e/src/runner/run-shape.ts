import * as Function from 'effect/Function'
import * as Result from 'effect/Result'

import type { E2EConfigInput } from '../Config/config.schema.js'
import { decodedConfigOf, type RunnerOptions } from './wiring.js'

/** What the run shape reads from the suite's composition root: the config defaults and the override environment. */
export type RunShapeOptions = Pick<RunnerOptions, 'defaults' | 'env'>

/** The Vitest `test` options a decoded config sets: the retries per failed test and the worker pool width. */
export interface E2ERunShape {
  readonly retry?: number
  readonly maxWorkers?: number
}

const runShapeOf = (config: E2EConfigInput, options: RunShapeOptions): E2ERunShape =>
  Result.match(decodedConfigOf({ config, defaults: options.defaults, env: options.env }), {
    onFailure: (): E2ERunShape => ({}),
    onSuccess: (decoded): E2ERunShape => ({ retry: decoded.retries, maxWorkers: decoded.workers }),
  })

/**
 * The config tier of the runner's precedence rule: the suite's `vitest.config.ts` spreads this into its `test`
 * block, so the decoded `retries` and `workers` (the CI run shape when neither is written) become Vitest's
 * `retry` and `maxWorkers`, and a CLI flag still overrides them. It decodes with the same defaults and
 * environment the runner and the global setup use, so all three agree on the run shape. A config the core
 * refuses sets nothing; the runner and the global setup report that refusal.
 */
export const e2eRunShape: {
  (options: RunShapeOptions): (config: E2EConfigInput) => E2ERunShape
  (config: E2EConfigInput, options: RunShapeOptions): E2ERunShape
} = Function.dual(2, runShapeOf)
