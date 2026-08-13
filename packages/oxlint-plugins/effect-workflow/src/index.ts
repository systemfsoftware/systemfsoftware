import { workflowCommandObject } from './rules/workflow-command-object.js'
import { workflowDeclarationForm } from './rules/workflow-declaration-form.js'
import { workflowEitherInhabited } from './rules/workflow-either-inhabited.js'
import { workflowInlineSchemas } from './rules/workflow-inline-schemas.js'
import { workflowMatchExhaustive } from './rules/workflow-match-exhaustive.js'
import { workflowNoAmbientImpurity } from './rules/workflow-no-ambient-impurity.js'
import { workflowNoAsync } from './rules/workflow-no-async.js'
import { workflowNoEffectImport } from './rules/workflow-no-effect-import.js'
import { workflowNoPanicVocabulary } from './rules/workflow-no-panic-vocabulary.js'
import { workflowNoThrow } from './rules/workflow-no-throw.js'
import { workflowNoUnconstructedVariant } from './rules/workflow-no-unconstructed-variant.js'
import { workflowPropertyTestShape } from './rules/workflow-property-test-shape.js'
import { workflowSchemaRequired } from './rules/workflow-schema-required.js'
import { workflowSingleFunctionExport } from './rules/workflow-single-function-export.js'
import { workflowSinglePath } from './rules/workflow-single-path.js'
import { workflowTypeidRequired } from './rules/workflow-typeid-required.js'
import { workflowTypeidSharedPerUnion } from './rules/workflow-typeid-shared-per-union.js'
import { workflowUnionSchemaDeclared } from './rules/workflow-union-schema-declared.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('workflow-command-object')]: 'error',
  // First, because it is the gate that makes the rest meaningful: it forces the export
  // through `Workflow.make`, and the constructor is what carries the channel-inhabitation
  // and no-Promise guarantees that `workflow-either-inhabited` and `workflow-no-async`
  // used to approximate from the outside.
  [rule('workflow-declaration-form')]: 'error',
  [rule('workflow-schema-required')]: 'error',
  [rule('workflow-either-inhabited')]: 'error',
  [rule('workflow-typeid-required')]: 'error',
  [rule('workflow-typeid-shared-per-union')]: 'error',
  [rule('workflow-union-schema-declared')]: 'error',
  [rule('workflow-no-unconstructed-variant')]: 'error',
  [rule('workflow-no-panic-vocabulary')]: 'error',
  [rule('workflow-match-exhaustive')]: 'error',
  [rule('workflow-single-path')]: 'error',
  [rule('workflow-no-throw')]: 'error',
  [rule('workflow-no-async')]: 'error',
  [rule('workflow-no-ambient-impurity')]: 'error',
  [rule('workflow-no-effect-import')]: 'error',
  [rule('workflow-single-function-export')]: 'error',
  [rule('workflow-property-test-shape')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'workflow-command-object': workflowCommandObject,
    'workflow-declaration-form': workflowDeclarationForm,
    'workflow-schema-required': workflowSchemaRequired,
    'workflow-either-inhabited': workflowEitherInhabited,
    'workflow-inline-schemas': workflowInlineSchemas,
    'workflow-typeid-required': workflowTypeidRequired,
    'workflow-typeid-shared-per-union': workflowTypeidSharedPerUnion,
    'workflow-union-schema-declared': workflowUnionSchemaDeclared,
    'workflow-no-unconstructed-variant': workflowNoUnconstructedVariant,
    'workflow-no-panic-vocabulary': workflowNoPanicVocabulary,
    'workflow-match-exhaustive': workflowMatchExhaustive,
    'workflow-single-path': workflowSinglePath,
    'workflow-no-throw': workflowNoThrow,
    'workflow-no-async': workflowNoAsync,
    'workflow-no-ambient-impurity': workflowNoAmbientImpurity,
    'workflow-no-effect-import': workflowNoEffectImport,
    'workflow-single-function-export': workflowSingleFunctionExport,
    'workflow-property-test-shape': workflowPropertyTestShape,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
