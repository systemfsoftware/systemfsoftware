/**
 * Oxlint Test Hygiene Plugin
 *
 * Provides ESLint-compatible rules for test naming conventions:
 * - DAMP (Descriptive And Meaningful Phrases) test naming
 * - Property-Based Test (PBT) naming
 */

import { dampTestNaming } from './rules/damp-test-naming.js'
import { pbtNaming } from './rules/pbt-naming.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-hygiene'

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'damp-test-naming': dampTestNaming,
    'pbt-naming': pbtNaming,
  },
}
