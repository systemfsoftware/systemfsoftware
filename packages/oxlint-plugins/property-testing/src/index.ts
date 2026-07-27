import { noAssertInProperty } from './rules/no-assert-in-property.js'
import { noSilentReturn } from './rules/no-silent-return.js'
import { propertyFilePurity } from './rules/property-file-purity.js'
import { requireEffectFastcheck } from './rules/require-effect-fastcheck.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-property-testing'
const recommendedRules = {
  '@systemfsoftware/oxlint-plugin-property-testing/no-silent-return': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/no-assert-in-property': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/property-file-purity': 'error',
  '@systemfsoftware/oxlint-plugin-property-testing/require-effect-fastcheck': 'error',
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
  },
  configs: {
    recommended: {
      plugins: [PLUGIN_NAME],
      rules: recommendedRules,
    },
  },
}
