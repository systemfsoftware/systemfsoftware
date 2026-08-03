/**
 * Oxlint Test Hygiene Plugin
 *
 * Provides ESLint-compatible rules for test quality:
 * - DAMP (Descriptive And Meaningful Phrases) test naming
 * - Property-Based Test (PBT) naming
 * - Assertions that invoke no behaviour
 */

import { dampTestNaming } from './rules/damp-test-naming.js'
import { noBehaviourlessAssertion } from './rules/no-behaviourless-assertion.js'
import { noUnrunEffectTest } from './rules/no-unrun-effect-test.js'
import { pbtNaming } from './rules/pbt-naming.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-hygiene'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('damp-test-naming')]: 'error',
  [rule('no-behaviourless-assertion')]: 'error',
  [rule('no-unrun-effect-test')]: 'error',
  [rule('pbt-naming')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'damp-test-naming': dampTestNaming,
    'no-behaviourless-assertion': noBehaviourlessAssertion,
    'no-unrun-effect-test': noUnrunEffectTest,
    'pbt-naming': pbtNaming,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
