import { observerNoEscapingState } from './rules/observer-no-escaping-state.js'
import { observerOperationalExports } from './rules/observer-operational-exports.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-observer'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('observer-operational-exports')]: 'error',
  [rule('observer-no-escaping-state')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'observer-operational-exports': observerOperationalExports,
    'observer-no-escaping-state': observerNoEscapingState,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
