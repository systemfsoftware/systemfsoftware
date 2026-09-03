import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement')],
  rules: {
    '@systemfsoftware/oxlint-plugin-test-placement/eviction-purity': 'error',
    '@systemfsoftware/oxlint-plugin-test-placement/in-source-test-laws-only': 'error',
  },
  ignorePatterns: [
    ...(all.ignorePatterns ?? []),
    'tests/__fixtures__/fixtures/**',
    'tests/__fixtures__/reuse-project/**',
  ],
})
