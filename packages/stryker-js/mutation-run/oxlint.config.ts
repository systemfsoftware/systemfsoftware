import { defineConfig } from 'oxlint'
import base from '../../oxlint-config/src/oxlint-config.base.ts'

export default defineConfig({
  extends: [base],

  rules: {
    // TypeScript already reports unused locals; avoids false positives in test files.
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
