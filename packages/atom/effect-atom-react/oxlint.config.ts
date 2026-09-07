import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

// Vendored fork: effect documents with @category/@since/@internal; teach the tag checker those tags.
export default defineConfig({
  extends: [all],
  rules: {
    'jsdoc/check-tag-names': [
      'error',
      { definedTags: ['category', 'since', 'internal', 'example', 'module', 'packageDocumentation'] },
    ],
  },
  ignorePatterns: [...(all.ignorePatterns ?? []), 'dist', 'node_modules'],
})
