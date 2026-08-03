import { stateNoRawPrimitiveExports } from './rules/state-no-raw-primitive-exports.js'
import { stateQuarantineHoldsState } from './rules/state-quarantine-holds-state.js'
import { stateSingleTagExport } from './rules/state-single-tag-export.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-state'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('state-quarantine-holds-state')]: 'error',
  [rule('state-no-raw-primitive-exports')]: 'error',
  [rule('state-single-tag-export')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'state-quarantine-holds-state': stateQuarantineHoldsState,
    'state-no-raw-primitive-exports': stateNoRawPrimitiveExports,
    'state-single-tag-export': stateSingleTagExport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
