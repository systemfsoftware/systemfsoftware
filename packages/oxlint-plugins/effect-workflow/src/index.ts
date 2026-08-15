import { workflowInlineSchemas } from './rules/workflow-inline-schemas.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'
import { workflowNoEffectImport } from './rules/workflow-no-effect-import.js'
import { workflowNoPanicVocabulary } from './rules/workflow-no-panic-vocabulary.js'
import { workflowPropertyTestShape } from './rules/workflow-property-test-shape.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * The residue, after `guard-workflow-authorship` made emission mandatory.
 *
 * Thirteen rules were deleted because a declaration cannot express their violation and the
 * gate now requires every `*.workflow.ts` to be a declaration's emission: shape, cardinality,
 * declaration form, TypeId placement, channel inhabitation, and the interior prohibitions on
 * `throw`, `async` and ambient impurity. Each is `INEXPRESSIBLE` in the probe under
 * `docs/plans/2026-08-15-generated-authorship/workflow-falsify.ts`, which attempts every
 * violation through the declaration and reports the emitter's verbatim refusal.
 *
 * What survives reads an edge or a vocabulary the declaration passes through verbatim, so an
 * emitted cell can still carry the violation:
 *
 * - `workflow-no-effect-import` - an import edge, which a declaration names as data and the
 *   emitter writes unexamined.
 * - `workflow-no-panic-vocabulary` - identifier vocabulary: the emitter cannot know that
 *   `UnexpectedError` is panic vocabulary rather than a domain name.
 * - `workflow-match-exhaustive` - decision-freedom over the emitted dispatch.
 * - `workflow-property-test-shape` - governs `*.property.test.ts`, which is outside the cell
 *   population and stays hand-authored, so no declaration reaches it.
 * - `workflow-inline-schemas` - registered but deliberately not recommended, so no package
 *   enables it; kept because its class is reachable, not because it fires today.
 */
const recommendedRules = {
  [rule('workflow-no-panic-vocabulary')]: 'error',
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('workflow-no-effect-import')]: 'error',
  [rule('workflow-property-test-shape')]: 'error',
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
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
