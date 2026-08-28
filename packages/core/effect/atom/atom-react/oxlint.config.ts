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
    'jsdoc/check-tag-names': [
      'error',
      { definedTags: ['category', 'since', 'internal', 'example', 'module', 'packageDocumentation'] },
    ],
    '@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api': 'error',
  },
  ignorePatterns: ['dist', 'node_modules'],
})
