import { noAssertInProperty } from './rules/no-assert-in-property.js'
import { noNestedQuantification } from './rules/no-nested-quantification.js'
import { noSilentReturn } from './rules/no-silent-return.js'
import { noUnboundedFanout } from './rules/no-unbounded-fanout.js'
import { propArbitrarySchemaOrigin } from './rules/prop-arbitrary-schema-origin.js'
import { propFixtureSchemaOrigin } from './rules/prop-fixture-schema-origin.js'
import { propGeneratedLawDuplicate } from './rules/prop-generated-law-duplicate.js'
import { propertyFilePurity } from './rules/property-file-purity.js'
import { requireEffectFastcheck } from './rules/require-effect-fastcheck.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-property-testing'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-silent-return')]: 'error',
  [rule('no-assert-in-property')]: 'error',
  [rule('property-file-purity')]: 'error',
  [rule('require-effect-fastcheck')]: 'error',
  [rule('no-unbounded-fanout')]: 'error',
  [rule('no-nested-quantification')]: 'error',
  [rule('prop-arbitrary-schema-origin')]: 'error',
  [rule('prop-fixture-schema-origin')]: 'error',
  [rule('prop-generated-law-duplicate')]: 'error',
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
    'prop-generated-law-duplicate': propGeneratedLawDuplicate,
    'prop-arbitrary-schema-origin': propArbitrarySchemaOrigin,
    'prop-fixture-schema-origin': propFixtureSchemaOrigin,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
