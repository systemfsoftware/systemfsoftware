import { executorDepsBorrowedTypes } from './rules/executor-deps-borrowed-types.js'
import { executorDepsTagName } from './rules/executor-deps-tag-name.js'
import { executorNoDomainBranch } from './rules/executor-no-domain-branch.js'
import { executorNoEscapingState } from './rules/executor-no-escaping-state.js'
import { executorNoIoInFilling } from './rules/executor-no-io-in-filling.js'
import { executorNoLayerBinding } from './rules/executor-no-layer-binding.js'
import { executorOwnsContextTag } from './rules/executor-owns-context-tag.js'
import { executorRequiresDepsTag } from './rules/executor-requires-deps-tag.js'
import { executorRequiresDescription } from './rules/executor-requires-description.js'
import { executorSingleOperationExport } from './rules/executor-single-operation-export.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-executor'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('executor-owns-context-tag')]: 'error',
  [rule('executor-deps-tag-name')]: 'error',
  [rule('executor-requires-deps-tag')]: 'error',
  [rule('executor-deps-borrowed-types')]: 'error',
  [rule('executor-no-domain-branch')]: 'error',
  [rule('executor-no-io-in-filling')]: 'error',
  [rule('executor-no-escaping-state')]: 'error',
  [rule('executor-no-layer-binding')]: 'error',
  [rule('executor-single-operation-export')]: 'error',
  [rule('executor-requires-description')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'executor-owns-context-tag': executorOwnsContextTag,
    'executor-deps-tag-name': executorDepsTagName,
    'executor-requires-deps-tag': executorRequiresDepsTag,
    'executor-deps-borrowed-types': executorDepsBorrowedTypes,
    'executor-no-domain-branch': executorNoDomainBranch,
    'executor-no-io-in-filling': executorNoIoInFilling,
    'executor-no-escaping-state': executorNoEscapingState,
    'executor-no-layer-binding': executorNoLayerBinding,
    'executor-single-operation-export': executorSingleOperationExport,
    'executor-requires-description': executorRequiresDescription,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
