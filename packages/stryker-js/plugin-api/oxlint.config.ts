import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  rules: {
    // TypeScript already reports unused locals; avoids false positives in test files.
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
