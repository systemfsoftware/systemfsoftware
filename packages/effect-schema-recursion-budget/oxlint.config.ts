import dmmf from '@systemfsoftware/oxlint-config-dmmf'
import { effect } from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [dmmf, effect],
  overrides: [
    {
      files: ['**/src/**', '!**/*.workflow.ts'],
      rules: {
        complexity: ['error', { max: 16, variant: 'modified' }],
      },
    },
  ],
})
