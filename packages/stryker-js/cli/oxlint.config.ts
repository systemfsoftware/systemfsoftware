import base from '@systemfsoftware/oxlint-config/base'
import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import effectEntrypoint from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import effectExecutor from '@systemfsoftware/oxlint-plugin-effect-executor'
import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-entrypoint'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-executor'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement'),
  ],

  rules: {
    ...cellVocabulary.configs.recommended.rules,
    ...effectEntrypoint.configs.recommended.rules,
    ...effectExecutor.configs.recommended.rules,
    ...testPlacement.configs.recommended.rules,
  },
})
