import { makeBodyPurity } from './rules/make-body-purity.js'
import { makeCommandSchema } from './rules/make-command-schema.js'
import { makeFileLocation } from './rules/make-file-location.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * The four rules this plugin ships for decision construction:
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
 * - `make-command-schema` - the command position holds a schema class. Scoped
 *   to the shapes `make`'s own type bound cannot refuse: an assertion, a
 *   laundering call, a `declare`d binding. It reports nothing the compiler
 *   already reports.
 */
const recommendedRules = {
  [rule('make-file-location')]: 'error',
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('make-body-purity')]: 'error',
  [rule('make-command-schema')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'make-file-location': makeFileLocation,
    'workflow-match-exhaustive': workflowMatchExhaustive,
    'make-body-purity': makeBodyPurity,
    'make-command-schema': makeCommandSchema,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
