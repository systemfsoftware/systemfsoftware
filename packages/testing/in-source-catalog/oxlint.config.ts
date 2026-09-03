import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'
export default defineConfig({
  extends: [base],
  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement')],
  rules: {
    '@systemfsoftware/oxlint-plugin-test-placement/eviction-purity': 'error',
  },
})
