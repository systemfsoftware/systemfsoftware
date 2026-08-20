import { makeBodyPurity } from './rules/make-body-purity.js'
import { makeFileLocation } from './rules/make-file-location.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * The three rules this plugin ships for decision construction:
 *
 * - `make-file-location` - the construction-site rule: `Workflow.make` may be
 *   invoked only in a `<stem>.workflow.ts` file (single-segment stem, no
 *   periods), and at most once per file.
 * - `make-body-purity` - the KTD3 purity gate: references inside a
 *   `Workflow.make` body resolve to parameters, const locals, module
 *   declarations, or audited-pure imports; control flow is one converging
 *   first-statement guard at most.
 * - `workflow-match-exhaustive` - decision-freedom over the dispatch,
 *   keyed on the `Workflow.make` boundary.
 */
const recommendedRules = {
  [rule('make-file-location')]: 'error',
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('make-body-purity')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'make-file-location': makeFileLocation,
    'workflow-match-exhaustive': workflowMatchExhaustive,
    'make-body-purity': makeBodyPurity,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
