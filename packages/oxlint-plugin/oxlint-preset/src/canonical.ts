import { defineConfig } from 'oxlint'

import cellVocabularyPreset from '@systemfsoftware/oxlint-plugin-cell-vocabulary/preset'
import effectEntrypointPreset from '@systemfsoftware/oxlint-plugin-effect-entrypoint/preset'
import effectNativePreset from '@systemfsoftware/oxlint-plugin-effect-native/preset'
import effectSchemaPreset from '@systemfsoftware/oxlint-plugin-effect-schema/preset'
import effectWorkflowPreset from '@systemfsoftware/oxlint-plugin-effect-workflow/preset'
import propertyTestingPreset from '@systemfsoftware/oxlint-plugin-property-testing/preset'
import recommended, {
  options as recommendedOptions,
  plugins as recommendedPlugins,
} from '@systemfsoftware/oxlint-plugin-recommended'
import structurePreset from '@systemfsoftware/oxlint-plugin-structure/preset'
import tagDisciplinePreset from '@systemfsoftware/oxlint-plugin-tag-discipline/preset'
import testHygienePreset from '@systemfsoftware/oxlint-plugin-test-hygiene/preset'
import testPlacementPreset from '@systemfsoftware/oxlint-plugin-test-placement/preset'

const PLUGIN_EXTENSIONS = ['jsdoc', 'node', 'oxc', 'promise'] as const

const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/tests/**',
] as const

/**
 * The canonical set for product code: the recommended stock tier, the ten
 * self-registering fragment presets — effect-native, tag-discipline, structure,
 * effect-schema, effect-workflow, property-testing, test-hygiene,
 * test-placement, cell-vocabulary, effect-entrypoint — the correctness category
 * at `error`, and the three rules that decide the pure core.
 *
 * Post-cutover (R9) the two re-key aggregates (`@systemfsoftware/oxlint-plugin`
 * and `@systemfsoftware/oxlint-plugin-effect-dmmf`) are deleted, so the chain
 * names only leaf packages and every rule id in it is owned by the package that
 * declares it: the composed custom-rule set is exactly the union of the ten
 * fragments' recommended rules.
 *
 * @public
 */
export default defineConfig({
  extends: [
    recommended,
    effectNativePreset,
    tagDisciplinePreset,
    structurePreset,
    effectSchemaPreset,
    effectWorkflowPreset,
    propertyTestingPreset,
    testHygienePreset,
    testPlacementPreset,
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
      files: [...testFilePatterns],
      rules: { complexity: 'off' },
    },
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
})
