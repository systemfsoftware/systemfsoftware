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
    // Enabled per-package because the shared config deliberately leaves it out.
    // It judges a class by the expression it extends, so `Context.Service`,
    // `S.TaggedError` and `Schema` stay legal and nothing else does. It belongs to
    // no oxlint category, which is why `correctness` never caught the ~40 classes
    // with mutable fields and impure constructors this subsystem was graded F- for
    // — including two whose instance methods were unreachable across the worker
    // IPC boundary because the dispatcher reads properties off the export.
    '@systemfsoftware/oxlint-plugin/ban-classes': 'error',
    ...cellVocabulary.configs.recommended.rules,
    ...effectEntrypoint.configs.recommended.rules,
    ...testPlacement.configs.recommended.rules,
  },
})
