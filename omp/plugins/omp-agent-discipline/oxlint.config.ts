import strict from '@systemfsoftware/oxlint-config/strict'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [strict],
  overrides: [
    {
      files: ['tests/**'],
      rules: {
        '@systemfsoftware/effect-dmmf/tests-import-public-api': 'off',
        '@systemfsoftware/effect-dmmf/behaviour-one-feature-per-file': 'off',
      },
    },
  ],
})
