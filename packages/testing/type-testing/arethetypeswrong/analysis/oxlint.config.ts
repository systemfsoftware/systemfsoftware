import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],
  overrides: [
    {
      files: ['src/internal/esm/Resolver.ts'],
      rules: {
        '@systemfsoftware/no-domain-branching-density': 'warn',
      },
    },
  ],
})
