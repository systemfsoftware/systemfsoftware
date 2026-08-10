import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-taxonomy')],

  rules: {
    '@systemfsoftware/oxlint-plugin-cell-taxonomy/capability-named-directory': 'error',
    // TypeScript already reports unused locals; avoids false positives in test files.
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
