import { capabilityNamedDirectory } from './rules/capability-named-directory.js'
import { cellSuffixRequired } from './rules/cell-suffix-required.js'
import { combinatorComposesAKernel } from './rules/combinator-composes-a-kernel.js'
import { harnessNoModuleScopeRegistration } from './rules/harness-no-module-scope-registration.js'
import { typeNoRuntimeExport } from './rules/type-no-runtime-export.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-taxonomy'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('cell-suffix-required')]: 'error',
  [rule('combinator-composes-a-kernel')]: 'error',
  [rule('harness-no-module-scope-registration')]: 'error',
  [rule('type-no-runtime-export')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'cell-suffix-required': cellSuffixRequired,
    'capability-named-directory': capabilityNamedDirectory,
    'combinator-composes-a-kernel': combinatorComposesAKernel,
    'harness-no-module-scope-registration': harnessNoModuleScopeRegistration,
    'type-no-runtime-export': typeNoRuntimeExport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
