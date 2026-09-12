import { defaultIgnores } from '@systemfsoftware/oxlint-preset'
import { defineConfig } from 'oxlint'

import instrument from '@systemfsoftware/oxlint-preset/instrument'

export default defineConfig({
  extends: [instrument],

  // ignorePatterns replaces under extends, so the list is derived from the
  // preset's canonical exclusion set plus this subtree's built library output.
  ignorePatterns: [...defaultIgnores, '**/lib/**'],

  overrides: [
    {
      files: ['oxlint-plugin-test-placement/src/rules/__tests__/_guards.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
})
