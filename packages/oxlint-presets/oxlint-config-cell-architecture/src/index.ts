import cellArchitecture from '@systemfsoftware/oxlint-plugin-cell-architecture'
import type { OxlintConfig } from 'oxlint'

export const jsPlugins: readonly string[] = [
  import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-architecture'),
]

export const plugins: NonNullable<OxlintConfig['plugins']> = [
  'typescript',
  'import',
  'jsdoc',
  'oxc',
  'promise',
]

export const options: NonNullable<OxlintConfig['options']> = {
  typeAware: true,
}

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...cellArchitecture.configs.recommended.rules,
}

export const ignorePatterns: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/lib/**',
  '**/esm/**',
  '**/cjs/**',
  '**/build/**',
  '**/out/**',
  '**/.tshy/**',
  '**/.tshy-build/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.stryker-tmp/**',
  '**/__pycache__/**',
  '**/*.d.ts',
  '**/*.tsbuildinfo',
  '**/*.mjs',
  '**/.claude/**',
  '**/.opencode/**',
  '**/.sisyphus/**',
  '**/.repo/**',
  '**/.worktrees/**',
  '**/.issues/**',
  '**/.papi/**',
  '**/submodules/**',
  '**/repos/**',
]

const noNodeBuiltinImports: NonNullable<OxlintConfig['rules']>['no-restricted-imports'] = [
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
]

const cellArchitectureConfig: OxlintConfig = {
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...options },
  categories: { correctness: 'error' },
  ignorePatterns: [...ignorePatterns],
  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: {
        ...rules,
        'no-restricted-imports': noNodeBuiltinImports,
      },
    },
    {
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}

export default cellArchitectureConfig
