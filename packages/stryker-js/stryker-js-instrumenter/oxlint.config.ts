import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],
  rules: {
    '@systemfsoftware/oxlint-plugin-structure/ban-classes': 'error',
  },
})
