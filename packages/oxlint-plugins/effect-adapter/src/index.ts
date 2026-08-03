import { adapterLayerRequired } from './rules/adapter-layer-required.js'
import { adapterNoCast } from './rules/adapter-no-cast.js'
import { adapterSingleExternalSystem } from './rules/adapter-single-external-system.js'
import { adapterSingleLayerExport } from './rules/adapter-single-layer-export.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-adapter'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('adapter-single-external-system')]: 'error',
  [rule('adapter-no-cast')]: 'error',
  [rule('adapter-layer-required')]: 'error',
  [rule('adapter-single-layer-export')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'adapter-single-external-system': adapterSingleExternalSystem,
    'adapter-no-cast': adapterNoCast,
    'adapter-layer-required': adapterLayerRequired,
    'adapter-single-layer-export': adapterSingleLayerExport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
