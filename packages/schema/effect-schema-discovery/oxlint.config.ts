import presets from '@systemfsoftware/oxlint-plugin-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [presets.configs.dmmf],
  overrides: [
    {
      files: ['**/src/**', '!**/*.workflow.ts'],
      rules: {
        complexity: ['error', { max: 20, variant: 'modified' }],
      },
    },
  ],
})
