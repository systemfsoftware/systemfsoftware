import { policyCombinatorExport } from './rules/policy-combinator-export.js'
import { policyNoDomainImports } from './rules/policy-no-domain-imports.js'
import { policyNoErrorRewriting } from './rules/policy-no-error-rewriting.js'
import { policyNoJunkDrawerPath } from './rules/policy-no-junk-drawer-path.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-policy'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('policy-combinator-export')]: 'error',
  [rule('policy-no-domain-imports')]: 'error',
  [rule('policy-no-error-rewriting')]: 'error',
  [rule('policy-no-junk-drawer-path')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'policy-combinator-export': policyCombinatorExport,
    'policy-no-domain-imports': policyNoDomainImports,
    'policy-no-error-rewriting': policyNoErrorRewriting,
    'policy-no-junk-drawer-path': policyNoJunkDrawerPath,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
