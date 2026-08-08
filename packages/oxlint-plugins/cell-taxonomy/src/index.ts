import { capabilityNamedDirectory } from './rules/capability-named-directory.js'
import { cellSuffixRequired } from './rules/cell-suffix-required.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-taxonomy'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('cell-suffix-required')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'cell-suffix-required': cellSuffixRequired,
    'capability-named-directory': capabilityNamedDirectory,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
