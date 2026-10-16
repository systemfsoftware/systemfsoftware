import recommended, {
  fetchAndStoryScreenshotProperties,
  fetchInComponentsGlobals,
  fetchInComponentsProperties,
  nodeBuiltinAndUiStateImports,
  type PatternImportBan,
  storyScreenshotProperties,
  uiStateImports,
} from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

const legacyClient = { group: ['@consumer/legacy-client'], message: 'Reach the legacy API through its Effect service.' }

const withLegacyClient = ([severity, options]: PatternImportBan): PatternImportBan => [
  severity,
  { ...options, patterns: [...options.patterns, legacyClient] },
]

const storageMessage = 'Persist through the KeyValueStore service.'

export default defineConfig({
  extends: [recommended],
  rules: {
    'no-restricted-imports': withLegacyClient(uiStateImports),
  },
  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: {
        'no-restricted-imports': withLegacyClient(nodeBuiltinAndUiStateImports),
      },
    },
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: {
        'no-restricted-imports': withLegacyClient(uiStateImports),
      },
    },
    {
      files: ['**/*.tsx'],
      rules: {
        'no-restricted-globals': [...fetchInComponentsGlobals, { name: 'localStorage', message: storageMessage }],
        'no-restricted-properties': [
          ...fetchInComponentsProperties,
          { object: 'window', property: 'localStorage', message: storageMessage },
        ],
      },
    },
    {
      files: ['**/*.stories.tsx'],
      rules: {
        'no-restricted-properties': [
          ...fetchAndStoryScreenshotProperties,
          { object: 'window', property: 'localStorage', message: storageMessage },
        ],
      },
    },
    {
      files: ['**/*.ts'],
      rules: {
        'no-restricted-properties': ['error', { object: 'window', property: 'localStorage', message: storageMessage }],
      },
    },
    {
      files: ['**/*.stories.ts'],
      rules: {
        'no-restricted-properties': [
          ...storyScreenshotProperties,
          { object: 'window', property: 'localStorage', message: storageMessage },
        ],
      },
    },
  ],
})
