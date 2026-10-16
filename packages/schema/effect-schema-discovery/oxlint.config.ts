import dmmf from '@systemfsoftware/oxlint-config-dmmf'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [dmmf],
  overrides: [
    {
      files: ['**/src/**', '!**/*.workflow.ts'],
      rules: {
        complexity: ['error', { max: 20, variant: 'modified' }],
      },
    },
  ],
})
