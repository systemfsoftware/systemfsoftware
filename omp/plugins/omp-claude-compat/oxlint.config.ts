import strict from '@systemfsoftware/oxlint-config/strict'
import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import effectExecutor from '@systemfsoftware/oxlint-plugin-effect-executor'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [strict],

  // Delivered consumer-side, not through the aggregate: the plugins walk a Cell description
  // at runtime, so they depend on `effect-cell-types`, and a plugin the aggregate declares
  // would close a build cycle. This package carries three pure phase bodies for them to judge
  // (`internal/run-hooks-for-event.executor.ts`, `internal/run-user-prompt-submit-hooks.executor.ts`).
  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-executor'),
  ],

  rules: {
    ...cellVocabulary.configs.recommended.rules,
    ...effectExecutor.configs.recommended.rules,
    // ── v4 migration: Context.Service replaces Context.Tag (class syntax
    // `extends Context.Service<Self, Shape>()(id)`); the shared ban-classes
    // rule only knows the v3 Context.Tag/Context.Reference variants. Every
    // name here is a context service key, not a domain class.
    '@systemfsoftware/oxlint-plugin/ban-classes': [
      'error',
      {
        whitelist: [
          'AsyncHookContextState',
          'CollectSettingsGapsExecutorDeps',
          'LoadSettingsExecutorDeps',
          'RunHookScriptExecutorDeps',
          'RunHooksForEventExecutorDeps',
          'RunLifecycleHooksExecutorDeps',
          'RunPostToolUseFailureHooksExecutorDeps',
          'RunPostToolUseHooksExecutorDeps',
          'RunPreCompactHooksExecutorDeps',
          'RunPreToolUseHooksExecutorDeps',
          'RunSessionStartHooksExecutorDeps',
          'RunSessionSwitchHooksExecutorDeps',
          'RunToolResultHooksExecutorDeps',
          'RunUserPromptSubmitHooksExecutorDeps',
          'SuperviseForkExecutorDeps',
        ],
      },
    ],
  },
})
