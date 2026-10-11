import { correctness as tsgoCorrectness, recommended as tsgoRecommended } from '@effect/tsgo/oxlint-presets'
import cellArchitectureConfig, { jsPlugins as cellJsPlugins } from '@systemfsoftware/oxlint-config-cell-architecture'
import dmmfConfig, { jsPlugins as dmmfJsPlugins } from '@systemfsoftware/oxlint-config-dmmf'
import { ignorePatterns } from '@systemfsoftware/oxlint-config-rule-authoring'
import effectPlatform, { noNodeBuiltinImports } from '@systemfsoftware/oxlint-plugin-effect-platform'
import testDiscipline from '@systemfsoftware/oxlint-plugin-test-discipline'
import type { OxlintConfig, OxlintOverride } from 'oxlint'

export const promoteWarnToError = (rules: Record<string, unknown> | undefined): Record<string, 'error' | 'off'> => {
  const out: Record<string, 'error' | 'off'> = {}
  if (!rules) return out
  for (const [key, severity] of Object.entries(rules)) {
    if (severity === 'warn' || severity === 'error') out[key] = 'error'
    else if (severity === 'off') out[key] = 'off'
    else if (Array.isArray(severity) && (severity[0] === 'warn' || severity[0] === 'error')) out[key] = 'error'
    else if (Array.isArray(severity) && severity[0] === 'off') out[key] = 'off'
  }
  return out
}

const effectPlatformJsPlugin = import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-platform')

export const jsPlugins: readonly string[] = [
  ...dmmfJsPlugins,
  ...cellJsPlugins,
  import.meta.resolve('@systemfsoftware/oxlint-plugin-test-discipline'),
  effectPlatformJsPlugin,
]

export const plugins: NonNullable<OxlintConfig['plugins']> = [
  'typescript',
  'import',
  'unicorn',
  'vitest',
  'jsdoc',
  'node',
  'oxc',
  'promise',
  'effecttsgo',
]

export const options: NonNullable<OxlintConfig['options']> = {
  typeAware: true,
}

// Off, not warn: a warning fails no command. Packages here build on Effect's unstable modules (ai, rpc,
// http, socket, process, cluster, Arbitrary) on purpose: `pnpm turbo run lint --continue` on 2026-10-08
// reported 898 unstable-api-usage findings in 11 packages, so `error` would fail all 11. The extended
// configs turn the rule on for every path, so it is set off here and again after the presets in the overrides.
const unstableApiUsage = { 'effecttsgo/unstable-api-usage': 'off' } as const

export interface ImportPattern {
  readonly group?: string[]
  readonly regex?: string
  readonly message: string
}

export type PatternImportBan = ['error', { readonly patterns: ImportPattern[] }]

const serverStateLibraries = [
  '@tanstack/react-query',
  '@tanstack/react-query-devtools',
  '@tanstack/react-query-persist-client',
  '@tanstack/react-query-next-experimental',
  'react-query',
  'swr',
  'urql',
  '@apollo/client/react',
  '@reduxjs/toolkit/query/react',
  '@trpc/react-query',
  '@trpc/tanstack-react-query',
]

const serverStatePatterns: ImportPattern[] = [
  {
    group: serverStateLibraries.flatMap((name) => [name, `${name}/**`]),
    message:
      'ui-state/server-data-lives-in-atoms: React server-state libraries are forbidden — read server data through effect-atom runtime atoms (appRuntime.atom, useAtomValue) over Effect services.',
  },
]

export const serverStateImports: PatternImportBan = ['error', { patterns: serverStatePatterns }]

type ImportRuleValue = NonNullable<OxlintOverride['rules']>['no-restricted-imports']

const bansByPattern = (value: ImportRuleValue): value is ['error', { readonly patterns: ImportPattern[] }] =>
  Array.isArray(value) && typeof value[1] === 'object' && 'patterns' in value[1] && Array.isArray(value[1].patterns)

const withServerState = (value: ImportRuleValue): PatternImportBan =>
  bansByPattern(value)
    ? ['error', { ...value[1], patterns: [...value[1].patterns, ...serverStatePatterns] }]
    : serverStateImports

export const nodeBuiltinAndServerStateImports: PatternImportBan = withServerState(noNodeBuiltinImports)

const withServerStateOverride = (override: OxlintOverride): OxlintOverride =>
  override.rules?.['no-restricted-imports'] === undefined
    ? override
    : {
      ...override,
      rules: { ...override.rules, 'no-restricted-imports': withServerState(override.rules['no-restricted-imports']) },
    }

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...testDiscipline.configs.recommended.rules,
  ...unstableApiUsage,
  'no-restricted-imports': serverStateImports,
}

const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/tests/**',
] as const

const entryFilePatterns = [...testFilePatterns, '**/test-types/**', '**/examples/**'] as const

const libraryRules: NonNullable<OxlintConfig['rules']> = {
  ...promoteWarnToError(tsgoCorrectness.rules),
  ...promoteWarnToError(tsgoRecommended.rules),
  ...effectPlatform.configs.recommended.rules,
  ...unstableApiUsage,
  'effecttsgo/global-date-in-effect': 'error',
  'effecttsgo/global-timers-in-effect': 'error',
  'effecttsgo/new-promise': 'error',
  'effecttsgo/strict-boolean-expressions': 'error',
  'effecttsgo/missing-pipeable-signature': 'error',
  'effecttsgo/missed-pipeable-opportunity': 'error',
  'effecttsgo/process-env': 'error',
  'effecttsgo/any-unknown-in-error-context': 'error',
  'effecttsgo/global-date': 'error',
  'effecttsgo/global-timers': 'error',
  'effecttsgo/node-builtin-import': 'error',
}

const entryRules: NonNullable<OxlintConfig['rules']> = {
  ...libraryRules,
  'effecttsgo/node-builtin-import': 'off',
}

const observerOverrides: NonNullable<OxlintConfig['overrides']> = [
  {
    files: [...testFilePatterns],
    rules: {
      'vitest/expect-expect': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-identical-title': 'error',
    },
  },
]

const fetchInComponentsMessage =
  'ui-state/components-perform-no-io: a .tsx module performs no I/O — reach the server through an Effect service in a .ts module, read through an effect-atom runtime atom.'

const fetchInComponentsOverride: OxlintOverride = {
  files: ['**/*.tsx'],
  rules: {
    'no-restricted-globals': ['error', { name: 'fetch', message: fetchInComponentsMessage }],
    'no-restricted-properties': [
      'error',
      ...['globalThis', 'window', 'self'].map((object) => ({
        object,
        property: 'fetch',
        message: fetchInComponentsMessage,
      })),
    ],
  },
}

const recommendedConfig: OxlintConfig = {
  extends: [dmmfConfig, cellArchitectureConfig],
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...options },
  rules: { ...rules },
  categories: { correctness: 'error' },
  ignorePatterns: [...ignorePatterns],
  overrides: [
    ...observerOverrides,
    { files: ['**/src/**'], rules: libraryRules },
    { files: [...entryFilePatterns], rules: entryRules },
    ...effectPlatform.configs.recommended.overrides.map(withServerStateOverride),
    fetchInComponentsOverride,
  ],
}

export default recommendedConfig
