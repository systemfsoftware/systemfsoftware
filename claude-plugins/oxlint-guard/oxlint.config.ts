import strict from '@systemfsoftware/oxlint-config/strict'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [strict],
  // Not redundant: this package commits `dist/` (see its `.gitignore`), which takes the bundles
  // out of git's ignore set and so out of oxlint's — without this the linter walks inlined Effect.
  ignorePatterns: ['dist/**'],
})
