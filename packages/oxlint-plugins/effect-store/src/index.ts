import { storeAclRequired } from './rules/store-acl-required.js'
import { storeEffectFnRequired } from './rules/store-effect-fn-required.js'
import { storeImportBoundary } from './rules/store-import-boundary.js'
import { storeNoDomainBranch } from './rules/store-no-domain-branch.js'
import { storeNoDriverConstruction } from './rules/store-no-driver-construction.js'
import { storeNoEscapingState } from './rules/store-no-escaping-state.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-store'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('store-acl-required')]: 'error',
  [rule('store-effect-fn-required')]: 'error',
  [rule('store-import-boundary')]: 'error',
  [rule('store-no-domain-branch')]: 'error',
  [rule('store-no-driver-construction')]: 'error',
  [rule('store-no-escaping-state')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'store-acl-required': storeAclRequired,
    'store-effect-fn-required': storeEffectFnRequired,
    'store-import-boundary': storeImportBoundary,
    'store-no-domain-branch': storeNoDomainBranch,
    'store-no-driver-construction': storeNoDriverConstruction,
    'store-no-escaping-state': storeNoEscapingState,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
