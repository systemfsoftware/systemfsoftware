import { capabilityNamedDirectory } from './rules/capability-named-directory.js'
import { cellSuffixRequired } from './rules/cell-suffix-required.js'
import { harnessNoModuleScopeRegistration } from './rules/harness-no-module-scope-registration.js'
import { noRuntimeExportInTypeCell } from './rules/no-runtime-export-in-type-cell.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-taxonomy'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('cell-suffix-required')]: 'error',
  [rule('harness-no-module-scope-registration')]: 'error',
  [rule('no-runtime-export-in-type-cell')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'cell-suffix-required': cellSuffixRequired,
    'capability-named-directory': capabilityNamedDirectory,
    'harness-no-module-scope-registration': harnessNoModuleScopeRegistration,
    'no-runtime-export-in-type-cell': noRuntimeExportInTypeCell,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
