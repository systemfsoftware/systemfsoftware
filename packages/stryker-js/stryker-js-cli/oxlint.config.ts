import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  rules: {
    '@systemfsoftware/oxlint-plugin-effect-entrypoint/runtime-construction-placement': [
      'error',
      { edges: ['global-setup.ts'] },
    ],
  },
  ignorePatterns: [
    ...(all.ignorePatterns ?? []),
    'tests/__fixtures__/fixtures/**',
  ],
})
