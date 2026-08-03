import { aclNoAntiPatternPath } from './rules/acl-no-anti-pattern-path.js'
import { aclNoAsCasts } from './rules/acl-no-as-casts.js'
import { aclSingleTransformExport } from './rules/acl-single-transform-export.js'
import { aclTransformOrfailRequired } from './rules/acl-transform-orfail-required.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-acl'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('acl-no-anti-pattern-path')]: 'error',
  [rule('acl-no-as-casts')]: 'error',
  [rule('acl-single-transform-export')]: 'error',
  [rule('acl-transform-orfail-required')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'acl-no-anti-pattern-path': aclNoAntiPatternPath,
    'acl-no-as-casts': aclNoAsCasts,
    'acl-single-transform-export': aclSingleTransformExport,
    'acl-transform-orfail-required': aclTransformOrfailRequired,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
