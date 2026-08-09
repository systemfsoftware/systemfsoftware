import { defineConfig } from 'oxlint'

// Vendored fork: effect documents with @category/@since/@internal; teach the tag checker those tags.
export default defineConfig({
  plugins: ['typescript', 'import', 'jsdoc', 'unicorn', 'oxc'],
  rules: {
    'import/no-cycle': 'warn',
    'unicorn/prefer-node-protocol': 'error',
    'jsdoc/check-tag-names': [
      'error',
      { definedTags: ['category', 'since', 'internal', 'example', 'module', 'packageDocumentation'] },
    ],
  },
  ignorePatterns: ['dist', 'node_modules'],
})
