import base from '@systemfsoftware/oxlint-config/base'
import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import effectEntrypoint from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-entrypoint'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement'),
  ],

  rules: {
    ...cellVocabulary.configs.recommended.rules,
    ...effectEntrypoint.configs.recommended.rules,
    ...testPlacement.configs.recommended.rules,
    // The shared ban-classes rule only knows the v3 Context.Tag/Reference
    // variants; v4's Context.Service keeps class syntax
    // (`extends Context.Service<Self, Shape>()(id)`), so the package's port
    // tag classes are whitelisted here (same precedent as
    // packages/effect-gherkin-spec/oxlint.config.ts).
    '@systemfsoftware/oxlint-plugin/ban-classes': [
      'error',
      { whitelist: ['OutputModeProbeTag', 'RunEventStreamPortTag', 'StrykerCli'] },
    ],
  },
})
