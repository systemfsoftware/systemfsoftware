import { correctness as tsgoCorrectness, recommended as tsgoRecommended } from '@effect/tsgo/oxlint-presets'
import cellArchitectureConfig, { jsPlugins as cellJsPlugins } from '@systemfsoftware/oxlint-config-cell-architecture'
import dmmfConfig, { ignorePatterns, jsPlugins as dmmfJsPlugins } from '@systemfsoftware/oxlint-config-dmmf'
import effectPlatform from '@systemfsoftware/oxlint-plugin-effect-platform'
import testDiscipline from '@systemfsoftware/oxlint-plugin-test-discipline'
import type { OxlintConfig } from 'oxlint'

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

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...testDiscipline.configs.recommended.rules,
}

const enforcedTestDisciplineRules = ['expect-boolean-predicate', 'expect-from-effect-vitest'] as const

const enforcedRules: NonNullable<OxlintConfig['rules']> = Object.fromEntries(
  Object.entries(rules).filter(([key]) => enforcedTestDisciplineRules.some((name) => key.endsWith(`/${name}`))),
)

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

const recommendedConfig: OxlintConfig = {
  extends: [dmmfConfig, cellArchitectureConfig],
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...options },
  categories: { correctness: 'error' },
  rules: { ...enforcedRules },
  ignorePatterns: [...ignorePatterns],
  overrides: [
    ...observerOverrides,
    { files: ['**/src/**'], rules: libraryRules },
    { files: [...entryFilePatterns], rules: entryRules },
    ...effectPlatform.configs.recommended.overrides,
  ],
}

export default recommendedConfig
