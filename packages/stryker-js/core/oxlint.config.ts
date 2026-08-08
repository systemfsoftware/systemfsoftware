import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'
import { defineConfig } from 'oxlint'

export default defineConfig({
  rules: {
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],

  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement')],

  overrides: [
    // The fork is exempt from the cell rules (`scripts/check-lint-coverage.mjs`),
    // and that exemption silently covered the contract lane too. Scoped here so
    // the lane is governed from birth; the legacy `test/**` suite is untouched.
    {
      files: ['__tests__/**'],
      rules: {
        ...testPlacement.configs.recommended.rules,
      },
    },
  ],
})
