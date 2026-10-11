import recommended, {
  nodeBuiltinAndServerStateImports,
  type PatternImportBan,
  serverStateImports,
} from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

const legacyClient = { group: ['@consumer/legacy-client'], message: 'Reach the legacy API through its Effect service.' }

const withLegacyClient = ([severity, options]: PatternImportBan): PatternImportBan => [
  severity,
  { ...options, patterns: [...options.patterns, legacyClient] },
]

export default defineConfig({
  extends: [recommended],
  rules: {
    'no-restricted-imports': withLegacyClient(serverStateImports),
  },
  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: {
        'no-restricted-imports': withLegacyClient(nodeBuiltinAndServerStateImports),
      },
    },
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: {
        'no-restricted-imports': withLegacyClient(serverStateImports),
      },
    },
  ],
})
