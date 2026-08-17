import { defineConfig } from 'oxlint'
import base from '../../oxlint-config/src/oxlint-config.base.ts'

export default defineConfig({
  extends: [base],

  rules: {
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
