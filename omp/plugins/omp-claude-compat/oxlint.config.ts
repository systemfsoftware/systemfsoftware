import strict from '@systemfsoftware/oxlint-config/strict'
import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [strict],

  // Delivered consumer-side, not through the aggregate: the plugin walks a Cell description
  // at runtime, so it depends on `effect-cell-types`, and a plugin the aggregate declares
  // would close a build cycle. This package carries three pure phase bodies for it to judge
  // (`internal/run-hooks-for-event.executor.ts`, `internal/run-user-prompt-submit-hooks.executor.ts`).
  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary'),
  ],

  rules: {
    ...cellVocabulary.configs.recommended.rules,
  },
  overrides: [
    {
      files: ['tests/**'],
      rules: {
        '@systemfsoftware/effect-dmmf/tests-import-public-api': 'off',
        '@systemfsoftware/effect-dmmf/behaviour-one-feature-per-file': 'off',
      },
    },
  ],
})
