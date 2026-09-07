import { noIoInPhaseBodies } from './rules/no-io-in-phase-bodies.js'
import { noLaunderedCellService } from './rules/no-laundered-cell-service.js'
import { noSequencedCellRun } from './rules/no-sequenced-cell-run.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-vocabulary'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-io-in-phase-bodies')]: 'error',
  [rule('no-laundered-cell-service')]: 'error',
  [rule('no-sequenced-cell-run')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-io-in-phase-bodies': noIoInPhaseBodies,
    'no-laundered-cell-service': noLaunderedCellService,
    'no-sequenced-cell-run': noSequencedCellRun,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
