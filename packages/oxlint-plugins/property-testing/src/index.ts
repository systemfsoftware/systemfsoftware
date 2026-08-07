import { noAssertInProperty } from './rules/no-assert-in-property.js'
import { noNestedQuantification } from './rules/no-nested-quantification.js'
import { noSilentReturn } from './rules/no-silent-return.js'
import { noUnboundedFanout } from './rules/no-unbounded-fanout.js'
import { propertyFilePurity } from './rules/property-file-purity.js'
import { requireEffectFastcheck } from './rules/require-effect-fastcheck.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-property-testing'
const recommendedRules = {
  '@systemfsoftware/oxlint-plugin-property-testing/no-silent-return': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/no-assert-in-property': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/property-file-purity': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/require-effect-fastcheck': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/no-unbounded-fanout': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/no-nested-quantification': 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-silent-return': noSilentReturn,
    'no-assert-in-property': noAssertInProperty,
    'property-file-purity': propertyFilePurity,
    'require-effect-fastcheck': requireEffectFastcheck,
    'no-unbounded-fanout': noUnboundedFanout,
    'no-nested-quantification': noNestedQuantification,
  },
  configs: {
    recommended: {
      plugins: [PLUGIN_NAME],
      rules: recommendedRules,
    },
  },
}
