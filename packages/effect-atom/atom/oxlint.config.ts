import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
    perf: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'unicorn', 'oxc'],

  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-schema')],

  rules: {
    'import/no-cycle': 'warn',
    'unicorn/prefer-node-protocol': 'error',
    'jsdoc/check-tag-names': ['warn', { definedTags: ['category', 'since', 'internal'] }],
    // Dated baseline 2026-08-09 (KTD6; warn-severity-is-dominated A2): the
    // wire-contract unions PartialEncoded/Encoded and the published
    // Initial/Success/Failure interfaces keep their manual _tag members until
    // they migrate; entries shrink only. Allow keys match the member tag
    // value, so the unions' Initial/Success/Failure members are covered by the
    // three interface entries (U5: PartialEncoded/Encoded entries fire nothing
    // and were removed in the same change).
    '@systemfsoftware/oxlint-plugin-effect-schema/no-manual-tag-member': [
      'error',
      { allow: ['Initial', 'Success', 'Failure'] },
    ],
  },
})
