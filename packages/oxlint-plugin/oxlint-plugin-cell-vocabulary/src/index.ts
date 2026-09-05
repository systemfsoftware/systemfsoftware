import { noIoInPhaseBodies } from './rules/no-io-in-phase-bodies.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-vocabulary'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-io-in-phase-bodies')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-io-in-phase-bodies': noIoInPhaseBodies,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
