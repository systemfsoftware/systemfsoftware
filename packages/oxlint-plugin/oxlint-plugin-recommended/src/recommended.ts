import { correctness as tsgoCorrectness, recommended as tsgoRecommended } from '@effect/tsgo/oxlint-presets'
import effectPlatformPlugin from '@systemfsoftware/oxlint-plugin-effect-platform'
import testDisciplinePlugin from '@systemfsoftware/oxlint-plugin-test-discipline'
import type { OxlintConfig } from 'oxlint'
import { cellArchitecture, cellArchitectureJsPlugins } from './cell-architecture.js'
import { dmmf, dmmfJsPlugins } from './dmmf.js'

const promoteWarnToError = (rules: Record<string, unknown> | undefined): Record<string, 'error' | 'off'> => {
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
  ...effectPlatformPlugin.configs.recommended.rules,
  'effecttsgo/unstable-api-usage': 'off',
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

export const recommended: OxlintConfig = {
  extends: [dmmf, cellArchitecture],
  plugins: ['typescript', 'import', 'unicorn', 'vitest', 'jsdoc', 'node', 'oxc', 'promise', 'effecttsgo'],
  jsPlugins: [
    ...dmmfJsPlugins,
    ...cellArchitectureJsPlugins,
    import.meta.resolve('@systemfsoftware/oxlint-plugin-test-discipline'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-platform'),
  ],
  options: { typeAware: true },
  rules: { ...testDisciplinePlugin.configs.recommended.rules },
  categories: { correctness: 'error' },
  overrides: [
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
    { files: ['**/src/**'], rules: libraryRules },
    { files: [...entryFilePatterns], rules: entryRules },
    ...effectPlatformPlugin.configs.recommended.overrides,
  ],
}
