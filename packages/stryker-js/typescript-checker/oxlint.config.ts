import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  rules: {
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
