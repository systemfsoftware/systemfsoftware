import presets from '@systemfsoftware/oxlint-plugin-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [presets.configs.recommended],
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
