import recommended, {
  nodeBuiltinAndServerStateImports,
  serverStateImports,
} from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

// A consumer that bans one library of its own. oxlint replaces a no-restricted-imports value instead of merging it,
// so the consumer spreads the preset's composed value for each file group and appends its pattern.
const legacyClient = { group: ['@consumer/legacy-client'], message: 'Reach the legacy API through its Effect service.' }

const [nodeSeverity, nodeOptions] = nodeBuiltinAndServerStateImports
const [severity, options] = serverStateImports

export default defineConfig({
  extends: [recommended],
  rules: {
    'no-restricted-imports': [severity, { ...options, patterns: [...options.patterns, legacyClient] }],
  },
  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: {
        'no-restricted-imports': [nodeSeverity, { ...nodeOptions, patterns: [...nodeOptions.patterns, legacyClient] }],
      },
    },
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: {
        'no-restricted-imports': [severity, { ...options, patterns: [...options.patterns, legacyClient] }],
      },
    },
  ],
})
