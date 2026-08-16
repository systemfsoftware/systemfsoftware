import { defineConfig } from 'oxlint'

export default defineConfig({
  rules: {
    // TypeScript already reports unused locals; avoids false positives in test files.
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
