import { workflowInlineSchemas } from './rules/workflow-inline-schemas.js'
import { workflowNoAmbientImpurity } from './rules/workflow-no-ambient-impurity.js'
import { workflowNoAsync } from './rules/workflow-no-async.js'
import { workflowNoEffectImport } from './rules/workflow-no-effect-import.js'
import { workflowNoPanicVocabulary } from './rules/workflow-no-panic-vocabulary.js'
import { workflowNoUnconstructedVariant } from './rules/workflow-no-unconstructed-variant.js'
import { workflowPropertyTestShape } from './rules/workflow-property-test-shape.js'
import { workflowSingleFunctionExport } from './rules/workflow-single-function-export.js'
import { workflowTypeidRequired } from './rules/workflow-typeid-required.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'workflow-inline-schemas': workflowInlineSchemas,
    'workflow-no-effect-import': workflowNoEffectImport,
    'workflow-no-ambient-impurity': workflowNoAmbientImpurity,
    'workflow-no-async': workflowNoAsync,
    'workflow-no-unconstructed-variant': workflowNoUnconstructedVariant,
    'workflow-no-panic-vocabulary': workflowNoPanicVocabulary,
    'workflow-property-test-shape': workflowPropertyTestShape,
    'workflow-typeid-required': workflowTypeidRequired,
    'workflow-single-function-export': workflowSingleFunctionExport,
  },
}
