import { makeBodyPurity } from './rules/make-body-purity.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * The two rules this plugin ships for decision construction:
 *
 * - `make-body-purity` - the KTD3 purity gate: references inside a
 *   `Workflow.make` body resolve to parameters, const locals, module
 *   declarations, or audited-pure imports; control flow is one converging
 *   first-statement guard at most.
 * - `workflow-match-exhaustive` - decision-freedom over the dispatch,
 *   keyed on the `Workflow.make` boundary.
 */
const recommendedRules = {
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('make-body-purity')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'workflow-match-exhaustive': workflowMatchExhaustive,
    'make-body-purity': makeBodyPurity,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
