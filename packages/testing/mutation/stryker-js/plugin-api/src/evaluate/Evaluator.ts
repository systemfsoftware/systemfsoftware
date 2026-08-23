import type { schema } from '../core/index.js'

/**
 * Runs against the finished mutation report. Listing the plugin module
 * activates it — there is no separate name list.
 */
export interface Evaluator {
  evaluate(report: schema.MutationTestResult): void
}
