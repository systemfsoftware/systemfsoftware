import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  rules: {
    'jsdoc/check-tag-names': ['error', { definedTags: ['category', 'since', 'internal'] }],
  },
  ignorePatterns: [...(all.ignorePatterns ?? []), 'tests/AtomRpc.integration.test.ts'],
})
