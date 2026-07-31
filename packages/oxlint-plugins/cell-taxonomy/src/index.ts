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
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
