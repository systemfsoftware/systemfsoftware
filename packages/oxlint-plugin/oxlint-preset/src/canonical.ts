import { defineConfig } from 'oxlint'

import cellVocabularyPreset from '@systemfsoftware/oxlint-plugin-cell-vocabulary/preset'
import effectDmmfPreset from '@systemfsoftware/oxlint-plugin-effect-dmmf/preset'
import effectEntrypointPreset from '@systemfsoftware/oxlint-plugin-effect-entrypoint/preset'
import recommended, {
  options as recommendedOptions,
  plugins as recommendedPlugins,
} from '@systemfsoftware/oxlint-plugin-recommended'
import housePreset from '@systemfsoftware/oxlint-plugin/preset'

const PLUGIN_EXTENSIONS = ['jsdoc', 'node', 'oxc', 'promise'] as const

const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/tests/**',
] as const

/**
 * The canonical set for product code: the recommended stock tier, the house
 * effect tier, the cell-vocabulary, effect-dmmf and effect-entrypoint plugin
 * fragments each of which registers its own `jsPlugins` and `rules`, the
 * correctness category at `error`, and the three rules that decide the pure
 * core.
 *
 * @public
 */
export default defineConfig({
  extends: [
    recommended,
    housePreset,
    effectDmmfPreset,
    cellVocabularyPreset,
    effectEntrypointPreset,
  ],
  plugins: [...recommendedPlugins, ...PLUGIN_EXTENSIONS],
  options: { ...recommendedOptions },
  categories: { correctness: 'error' },
  rules: {
    'no-ternary': 'error',
    'typescript/switch-exhaustiveness-check': [
      'error',
      { allowDefaultCaseForExhaustiveSwitch: false, considerDefaultExhaustiveForUnions: false },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '^node:.*',
            message:
              'Importing Node.js builtins via "node:" is forbidden — use "@effect/platform" or a Web Standard API (e.g. global URL, fetch, Web Crypto, Web Streams) instead.',
          },
          {
            regex:
              '^(?:assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(?:/.*)?$',
            message:
              'Importing Node.js builtins without the "node:" prefix is forbidden (e.g. "fs") — use "@effect/platform" or a Web Standard API instead. Even "node:fs" is forbidden.',
          },
          {
            regex: '^@std/(?:encoding|fs|path|streams)(?:/.*)?$',
            message:
              'Importing @std modules that mirror Effect services (encoding → Encoding, fs → FileSystem, path → Path, streams → Stream) is forbidden — use the corresponding Effect module instead.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/src/**'],
      rules: { complexity: ['error', { max: 2, variant: 'modified' }] },
    },
    {
      files: ['**/src/**/*.workflow.ts'],
      rules: { complexity: ['error', { max: 1, variant: 'modified' }] },
    },
    {
      files: [...testFilePatterns],
      rules: { complexity: 'off' },
    },
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
})
