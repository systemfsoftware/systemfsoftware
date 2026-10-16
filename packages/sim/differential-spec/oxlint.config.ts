import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  overrides: [
    {
      files: ['src/dsl/**'],
      rules: {
        'vitest/expect-expect': [
          'error',
          { assertFunctionNames: ['expect', 'runDifferentialWithShrink', 'runMetamorphicWithShrink'] },
        ],
      },
    },
  ],
})
