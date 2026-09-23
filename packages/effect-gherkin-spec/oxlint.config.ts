import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  overrides: [
    {
      // Providing the caller's Layer is this module's public API.
      files: ['src/CaseLayers.ts', 'src/extensions/Pairwise.ts'],
      rules: { 'effecttsgo/strict-effect-provide': 'off' },
    },
  ],
})
