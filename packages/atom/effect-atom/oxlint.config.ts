import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  categories: {
    correctness: 'error',
    perf: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'unicorn', 'oxc'],

  rules: {
    'import/no-cycle': 'warn',
    'unicorn/prefer-node-protocol': 'error',
    'jsdoc/check-tag-names': ['warn', { definedTags: ['category', 'since', 'internal'] }],
  },

  ignorePatterns: ['tests/AtomRpc.integration.test.ts'],
})
