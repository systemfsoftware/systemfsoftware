import { defineConfig } from 'oxlint'
import base from '../../oxlint-config/src/oxlint-config.base.ts'

export default defineConfig({
  extends: [base],
  ignorePatterns: ['**/testResources/**'],
})
