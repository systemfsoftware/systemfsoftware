import house from '@systemfsoftware/oxlint-plugin'
import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import effectEntrypoint from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import {
  options as stockOptions,
  overrides as stockOverrides,
  plugins as stockPlugins,
  rules as stockRules,
} from '@systemfsoftware/oxlint-plugin-recommended'
import type { OxlintConfig } from 'oxlint'

/**
 * The custom plugins whose rules only exist once oxlint loads them. A rule
 * configured without its plugin loaded is reported as unknown, not applied, so
 * the specifier list and the rule list below are derived from the same imports.
 *
 * `import.meta.resolve` is what makes this work for an installed consumer: it
 * resolves each specifier against this module's own location, so the plugins
 * are found in the dependency tree that shipped them rather than in the
 * consumer's project root.
 */
const jsPlugins: readonly string[] = [
  import.meta.resolve('@systemfsoftware/oxlint-plugin'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-dmmf'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-entrypoint'),
]

/**
 * Built-in namespaces the enabled rules key on.
 *
 * Setting `plugins` REPLACES oxlint's default set rather than merging into it,
 * and there is no flag that reveals the loss — only `--disable-oxc-plugin`. So
 * `oxc` is listed explicitly: omitting it silently drops every oxc correctness
 * rule while `correctness: 'error'` still reads as enabled.
 *
 * @public
 */
export const plugins: NonNullable<OxlintConfig['plugins']> = [
  ...stockPlugins,
  'jsdoc',
  'node',
  'oxc',
  'promise',
]

/**
 * Every rule this stack recommends, taken from each plugin's own
 * `configs.recommended` rather than transcribed here. A copied rule list drifts
 * from the plugin that owns it and the drift is invisible: the misspelled or
 * retired key is reported as unknown at most once, and the rule it named is
 * simply absent from then on.
 *
 * @public
 */
export const rules: NonNullable<OxlintConfig['rules']> = {
  ...stockRules,
  ...house.configs.recommended.rules,
  ...cellVocabulary.configs.recommended.rules,
  ...effectDmmf.configs.recommended.rules,
  ...effectEntrypoint.configs.recommended.rules,
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
          regex: '^@std/(?:fs|path|encoding|streams)(?:/.*)?$',
          message:
            'Importing @std modules that mirror Effect services (fs → FileSystem, path → Path, encoding → Encoding, streams → Stream) is forbidden — use the corresponding Effect module instead.',
        },
      ],
    },
  ],
}

/**
 * Paths that are never source. Build output and generated declarations are the
 * load-bearing entries: a `dist/` left unignored makes a type-aware run read
 * emitted code and report findings no edit can fix.
 *
 * @public
 */
export const ignorePatterns: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.stryker-tmp/**',
  '**/*.d.ts',
  '**/*.tsbuildinfo',
]

/**
 * The complete preset as one `extends`-consumable oxlint config, and this package's
 * default export: `export default all` in an `oxlint.config.ts` delivers the
 * plugins, type awareness, the correctness category, the stock defect and
 * test-hygiene tiers, and every recommended cell rule at `error`.
 *
 * Type awareness is on, so a consumer needs a `tsconfig.json` that includes the
 * files being linted; half of these rules produce no diagnostics without it and
 * say nothing about being inert.
 *
 * @public
 */
const all: OxlintConfig = {
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...stockOptions },
  categories: { correctness: 'error' },
  rules: { ...rules },
  overrides: [
    ...stockOverrides,
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}

export default all
