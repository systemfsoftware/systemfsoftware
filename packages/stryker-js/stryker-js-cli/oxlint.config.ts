import all, { defaultIgnores } from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  ignorePatterns: [
    ...defaultIgnores,
    'tests/__fixtures__/fixtures/**',
  ],
})
