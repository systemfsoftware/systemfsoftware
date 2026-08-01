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
import { pbtNaming } from './rules/pbt-naming.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-hygiene'

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'damp-test-naming': dampTestNaming,
    'no-behaviourless-assertion': noBehaviourlessAssertion,
    'pbt-naming': pbtNaming,
  },
}
