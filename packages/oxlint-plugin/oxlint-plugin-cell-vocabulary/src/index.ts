import { noIoInPhaseBodies } from './rules/no-io-in-phase-bodies.js'
import { noPlatformProvideServiceOnRun } from './rules/no-platform-provide-service-on-run.js'
import { noTwoRunChain } from './rules/no-two-run-chain.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-vocabulary'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-io-in-phase-bodies')]: 'error',
  [rule('no-platform-provide-service-on-run')]: 'error',
  [rule('no-two-run-chain')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-io-in-phase-bodies': noIoInPhaseBodies,
    'no-platform-provide-service-on-run': noPlatformProvideServiceOnRun,
    'no-two-run-chain': noTwoRunChain,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
