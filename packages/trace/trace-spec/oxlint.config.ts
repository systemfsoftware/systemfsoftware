import presets from '@systemfsoftware/oxlint-plugin-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [presets.configs.recommended],
  overrides: [
    {
      files: ['tests/**'],
      rules: {
        'vitest/expect-expect': [
          'error',
          { assertFunctionNames: ['expect', 'Contract.check', 'Contract.verdictCheck', 'check', 'verdictCheck'] },
        ],
      },
    },
  ],
})
