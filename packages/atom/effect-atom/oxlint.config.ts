import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  rules: {
    'jsdoc/check-tag-names': ['error', { definedTags: ['category', 'since', 'internal'] }],
    'vitest/no-standalone-expect': [
      'error',
      { additionalTestBlockFunctions: ['Then', 'Given', 'When', 'And'] },
    ],
  },
})
