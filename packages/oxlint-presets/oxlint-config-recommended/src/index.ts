import { correctness as tsgoCorrectness, recommended as tsgoRecommended } from '@effect/tsgo/oxlint-presets'
import cellArchitectureConfig, { jsPlugins as cellJsPlugins } from '@systemfsoftware/oxlint-config-cell-architecture'
import dmmfConfig, { jsPlugins as dmmfJsPlugins } from '@systemfsoftware/oxlint-config-dmmf'
import { ignorePatterns } from '@systemfsoftware/oxlint-config-rule-authoring'
import effectPlatform, {
  noNodeBuiltinImports,
  reactImportBanNames,
} from '@systemfsoftware/oxlint-plugin-effect-platform'
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
  'react',
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
  readonly importNames?: string[]
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

const reactEffectPatterns: ImportPattern[] = [
  {
    regex: '^react$',
    importNames: [...reactImportBanNames],
    message:
      'ui-state/react-runs-no-effect: import react by name, and run no React Effect — read through an effect-atom runtime atom with useAtomValue, dispatch a command with useAtomSet.',
  },
]

const uiStatePatterns: ImportPattern[] = [...serverStatePatterns, ...reactEffectPatterns]

export const uiStateImports: PatternImportBan = ['error', { patterns: uiStatePatterns }]

type ImportRuleValue = NonNullable<OxlintOverride['rules']>['no-restricted-imports']

const bansByPattern = (value: ImportRuleValue): value is ['error', { readonly patterns: ImportPattern[] }] =>
  Array.isArray(value) && typeof value[1] === 'object' && 'patterns' in value[1] && Array.isArray(value[1].patterns)

const withUiState = (value: ImportRuleValue): PatternImportBan => {
  if (value === 'off') return uiStateImports
  if (bansByPattern(value)) return ['error', { ...value[1], patterns: [...value[1].patterns, ...uiStatePatterns] }]
  throw new Error(
    `no-restricted-imports value ${
      JSON.stringify(value)
    } is neither 'off' nor a patterns ban; compose the ui-state ban with it by hand`,
  )
}

export const nodeBuiltinAndUiStateImports: PatternImportBan = withUiState(noNodeBuiltinImports)

const withUiStateOverride = (override: OxlintOverride): OxlintOverride =>
  override.rules?.['no-restricted-imports'] === undefined
    ? override
    : {
      ...override,
      rules: { ...override.rules, 'no-restricted-imports': withUiState(override.rules['no-restricted-imports']) },
    }

// react/rules-of-hooks judges a hook by its name alone, so it reports Effect's `Service.use(...)`
// member calls; those live in .ts modules (atom recipes, service wiring), never in components. It stays
// an error where components live, in `**/*.tsx`, and `react/hooks` checks the Rules of Hooks in every file.
const reactRules: NonNullable<OxlintConfig['rules']> = {
  'react/rules-of-hooks': 'error',
  'react/hooks': 'error',
  'react/capitalized-calls': 'error',
  'react/rule-suppression': 'error',
  'react/unsupported-syntax': 'error',
  'react/no-unstable-nested-components': 'error',
  'react/no-array-index-key': 'error',
  'react/no-clone-element': 'error',
  'react/no-react-children': 'error',
  'react/prefer-function-component': 'error',
  '@systemfsoftware/oxlint-plugin-effect-platform/no-react-effect': 'error',
}

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...testDiscipline.configs.recommended.rules,
  ...unstableApiUsage,
  ...reactRules,
  'no-restricted-imports': uiStateImports,
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

export interface RestrictedGlobal {
  readonly name: string
  readonly message: string
}

export type RestrictedGlobalsBan = ['error', ...RestrictedGlobal[]]

export interface RestrictedProperty {
  readonly object: string
  readonly property: string
  readonly message: string
}

export type RestrictedPropertiesBan = ['error', ...RestrictedProperty[]]

export const fetchInComponentsGlobals: RestrictedGlobalsBan = ['error', {
  name: 'fetch',
  message: fetchInComponentsMessage,
}]

const fetchInComponentsEntries: RestrictedProperty[] = ['globalThis', 'window', 'self'].map((object) => ({
  object,
  property: 'fetch',
  message: fetchInComponentsMessage,
}))

export const fetchInComponentsProperties: RestrictedPropertiesBan = ['error', ...fetchInComponentsEntries]

const fetchInComponentsOverride: OxlintOverride = {
  files: ['**/*.tsx'],
  rules: {
    'no-restricted-globals': fetchInComponentsGlobals,
    'no-restricted-properties': fetchInComponentsProperties,
  },
}

const storyScreenshotEntries: RestrictedProperty[] = [{
  object: 'page',
  property: 'screenshot',
  message:
    'storybook-testing/visual-evidence-comes-from-the-runner: a story file never calls page.screenshot — the runner captures each story through one hook run for every story.',
}]

export const storyScreenshotProperties: RestrictedPropertiesBan = ['error', ...storyScreenshotEntries]

export const fetchAndStoryScreenshotProperties: RestrictedPropertiesBan = [
  'error',
  ...fetchInComponentsEntries,
  ...storyScreenshotEntries,
]

const storyScreenshotOverrides: OxlintOverride[] = [
  { files: ['**/*.stories.ts'], rules: { 'no-restricted-properties': storyScreenshotProperties } },
  { files: ['**/*.stories.tsx'], rules: { 'no-restricted-properties': fetchAndStoryScreenshotProperties } },
]

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
    { files: ['**/*.ts'], rules: { 'react/rules-of-hooks': 'off' } },
    ...effectPlatform.configs.recommended.overrides.map(withUiStateOverride),
    fetchInComponentsOverride,
    ...storyScreenshotOverrides,
  ],
}

export default recommendedConfig
