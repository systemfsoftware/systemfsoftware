import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
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
