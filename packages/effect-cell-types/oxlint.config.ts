import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'
export default defineConfig({
  extends: [base],

  rules: {
    // ── v4 migration: Context.Service replaces Context.Tag (class syntax
    // `extends Context.Service<Self, Shape>()(id)`); the shared ban-classes
    // rule only knows the v3 Context.Tag/Context.Reference variants.
    '@systemfsoftware/oxlint-plugin/ban-classes': [
      'error',
      { whitelist: ['Ledger'] },
    ],
  },
})
