import type { OxlintConfig, OxlintOverride } from 'oxlint'
import { entrypointInterpretsOnce } from './rules/entrypoint-interprets-once.js'
import { entrypointNoExports } from './rules/entrypoint-no-exports.js'
import { entrypointNoPromiseWrapper } from './rules/entrypoint-no-promise-wrapper.js'
import { entrypointNotImported } from './rules/entrypoint-not-imported.js'
import { noLoggingInCatch } from './rules/no-logging-in-catch.js'
import { noNativeMapInEffect } from './rules/no-native-map-in-effect.js'
import { noNativeSetInEffect } from './rules/no-native-set-in-effect.js'
import { noNewWorkerWithWasmImport } from './rules/no-new-worker-with-wasm-import.js'
import { noUnportedTimeSource } from './rules/no-unported-time-source.js'
import { runtimeConstructionPlacement } from './rules/runtime-construction-placement.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-platform'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/** The files that own the process timers, clocks, and randomness the rest of production source must reach through them. */
const PLATFORM_PORTS = [
  'packages/atom/effect-atom/src/internal/HostTimer.ts',
  'packages/schema/effect-schema-law/src/recursion-laws.ts',
  // Per-case salt for globally unique W3C trace IDs (traces are read back from a shared remote store); drawn outside the kernel run.
  'packages/trace/trace-spec/src/Suite.ts',
  'packages/vitest/vitest/src/internal/virtual-time.ts',
]

const recommendedRules: NonNullable<OxlintConfig['rules']> = {
  [rule('entrypoint-interprets-once')]: 'error',
  [rule('entrypoint-no-exports')]: 'error',
  [rule('entrypoint-not-imported')]: 'error',
  [rule('entrypoint-no-promise-wrapper')]: 'error',
  [rule('runtime-construction-placement')]: 'error',
  [rule('no-logging-in-catch')]: 'error',
  [rule('no-native-map-in-effect')]: 'error',
  [rule('no-native-set-in-effect')]: 'error',
  [rule('no-new-worker-with-wasm-import')]: 'error',
  [rule('no-unported-time-source')]: ['error', { ports: [...PLATFORM_PORTS] }],
} as const

export const noNodeBuiltinImports: NonNullable<OxlintOverride['rules']>['no-restricted-imports'] = [
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

const platformOverrides: OxlintOverride[] = [
  {
    files: ['**/src/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': noNodeBuiltinImports,
    },
  },
  {
    files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
]

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'entrypoint-interprets-once': entrypointInterpretsOnce,
    'entrypoint-no-exports': entrypointNoExports,
    'entrypoint-not-imported': entrypointNotImported,
    'entrypoint-no-promise-wrapper': entrypointNoPromiseWrapper,
    'runtime-construction-placement': runtimeConstructionPlacement,
    'no-logging-in-catch': noLoggingInCatch,
    'no-native-map-in-effect': noNativeMapInEffect,
    'no-native-set-in-effect': noNativeSetInEffect,
    'no-new-worker-with-wasm-import': noNewWorkerWithWasmImport,
    'no-unported-time-source': noUnportedTimeSource,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
      overrides: platformOverrides,
    },
  },
}
