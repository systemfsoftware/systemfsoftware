import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  categories: {
    correctness: 'error',
    perf: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'unicorn', 'oxc'],

  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement')],

  rules: {
    'import/no-cycle': 'warn',
    'unicorn/prefer-node-protocol': 'error',
    'jsdoc/check-tag-names': ['warn', { definedTags: ['category', 'since', 'internal'] }],
    '@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api': 'error',
    '@systemfsoftware/oxlint-plugin-effect-dmmf/no-hand-assertive-test-outside-src': 'error',
  },

  ignorePatterns: ['tests/AtomRpc.integration.test.ts'],
})
