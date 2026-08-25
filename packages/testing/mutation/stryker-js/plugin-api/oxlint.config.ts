import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  rules: {
    // Enabled per-package because the shared config deliberately leaves it out.
    // It judges a class by the expression it extends, so `Context.Service`,
    // `S.TaggedError` and `Schema` stay legal and nothing else does. It belongs to
    // no oxlint category, which is why `correctness` never caught the ~40 classes
    // with mutable fields and impure constructors this subsystem was graded F- for
    // — including two whose instance methods were unreachable across the worker
    // IPC boundary because the dispatcher reads properties off the export.
    '@systemfsoftware/oxlint-plugin/ban-classes': 'error',
    // TypeScript already reports unused locals; avoids false positives in test files.
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
