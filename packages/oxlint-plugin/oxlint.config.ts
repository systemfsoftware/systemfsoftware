import { defineConfig } from 'oxlint'
import { ruleAuthoring } from './oxlint-plugin-recommended/src/rule-authoring.ts'

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
