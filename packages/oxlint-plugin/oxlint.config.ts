import ruleAuthoring from '@systemfsoftware/oxlint-config-rule-authoring'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [ruleAuthoring],
  overrides: [
    {
      files: ['**/__tests__/_guards.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
})
