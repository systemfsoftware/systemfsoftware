import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  ignorePatterns: [
    ...(all.ignorePatterns ?? []),
    'tests/__fixtures__/fixtures/**',
  ],
})
