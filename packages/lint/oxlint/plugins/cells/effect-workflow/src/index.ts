import { dampWorkflowStem } from './rules/damp-workflow-stem.js'
import { makeBodyPurity } from './rules/make-body-purity.js'
import { makeCommandSchema } from './rules/make-command-schema.js'
import { makeFileLocation } from './rules/make-file-location.js'
import { workflowFileExportTopology } from './rules/workflow-file-export-topology.js'
import { workflowFileMakePresence } from './rules/workflow-file-make-presence.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * The rules this plugin ships for decision construction:
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
 * - `workflow-file-export-topology` - exactly one non-schema value export;
 *   re-exports forbidden. Enrolled in recommended after in-tree cutover.
 * - `damp-workflow-stem` - the stem of a `<stem>.workflow.ts` file is a
 *   kebab phrase of 2-5 lowercase tokens whose camelCase equals the file's
 *   single value export. Enrolled in recommended after in-tree cutover.
 * - `workflow-file-make-presence` - a `<stem>.workflow.ts` file constructs
 *   its decision with `Workflow.make`. Enrolled in recommended after
 *   in-tree cutover.
 */
const recommendedRules = {
  [rule('make-file-location')]: 'error',
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('make-body-purity')]: 'error',
  [rule('make-command-schema')]: 'error',
  [rule('workflow-file-export-topology')]: 'error',
  [rule('damp-workflow-stem')]: 'error',
  [rule('workflow-file-make-presence')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'damp-workflow-stem': dampWorkflowStem,
    'make-file-location': makeFileLocation,
    'workflow-match-exhaustive': workflowMatchExhaustive,
    'make-body-purity': makeBodyPurity,
    'make-command-schema': makeCommandSchema,
    'workflow-file-export-topology': workflowFileExportTopology,
    'workflow-file-make-presence': workflowFileMakePresence,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
