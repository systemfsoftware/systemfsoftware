import { makeBodyPurity } from './rules/make-body-purity.js'
import { workflowInlineSchemas } from './rules/workflow-inline-schemas.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'
import { workflowNoEffectImport } from './rules/workflow-no-effect-import.js'
import { workflowNoPanicVocabulary } from './rules/workflow-no-panic-vocabulary.js'
import { workflowPropertyTestShape } from './rules/workflow-property-test-shape.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * The six rules this plugin ships for decision construction:
 *
 * - `make-body-purity` - the KTD3 purity gate: references inside a
 *   `Workflow.make` body resolve to parameters, const locals, module
 *   declarations, or audited-pure imports; control flow is one converging
 *   first-statement guard at most.
 * - `workflow-no-effect-import` - an import edge.
 * - `workflow-no-panic-vocabulary` - identifier vocabulary: the module itself is
 *   the only place `UnexpectedError`-class names are known to be panic vocabulary.
 * - `workflow-match-exhaustive` - decision-freedom over the dispatch,
 *   keyed on the `Workflow.make` boundary.
 * - `workflow-property-test-shape` - governs `*.property.test.ts`, which stays
 *   hand-authored.
 * - `workflow-inline-schemas` - registered but deliberately not recommended, so no
 *   package enables it; kept because its class is reachable, not because it fires today.
 */
const recommendedRules = {
  [rule('workflow-no-panic-vocabulary')]: 'error',
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('workflow-no-effect-import')]: 'error',
  [rule('workflow-property-test-shape')]: 'error',
  [rule('make-body-purity')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'workflow-inline-schemas': workflowInlineSchemas,
    'workflow-no-panic-vocabulary': workflowNoPanicVocabulary,
    'workflow-match-exhaustive': workflowMatchExhaustive,
    'workflow-no-effect-import': workflowNoEffectImport,
    'workflow-property-test-shape': workflowPropertyTestShape,
    'make-body-purity': makeBodyPurity,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
