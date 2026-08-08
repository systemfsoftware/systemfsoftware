import base from '@systemfsoftware/oxlint-config/base'
import effectEntrypoint from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-entrypoint'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement'),
  ],

  rules: {
    ...effectEntrypoint.configs.recommended.rules,
    ...testPlacement.configs.recommended.rules,
  },
})
