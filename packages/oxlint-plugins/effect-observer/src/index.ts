import { observerNoDomainImports } from './rules/observer-no-domain-imports.js'
import { observerNoEscapingState } from './rules/observer-no-escaping-state.js'
import { observerNoProductionImport } from './rules/observer-no-production-import.js'
import { observerOperationalExports } from './rules/observer-operational-exports.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-observer'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('observer-no-domain-imports')]: 'error',
  [rule('observer-operational-exports')]: 'error',
  [rule('observer-no-escaping-state')]: 'error',
  [rule('observer-no-production-import')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'observer-no-domain-imports': observerNoDomainImports,
    'observer-operational-exports': observerOperationalExports,
    'observer-no-escaping-state': observerNoEscapingState,
    'observer-no-production-import': observerNoProductionImport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
