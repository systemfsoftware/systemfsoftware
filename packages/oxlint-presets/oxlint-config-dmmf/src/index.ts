import { correctness as tsgoCorrectness } from '@effect/tsgo/oxlint-presets'
import dmmfWorkflow from '@systemfsoftware/oxlint-plugin-dmmf-workflow'
import effectSchema from '@systemfsoftware/oxlint-plugin-effect-schema'
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
export const jsPlugins: readonly string[] = [
  import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-schema'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-dmmf-workflow'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-test-discipline'),
]

export const plugins: NonNullable<OxlintConfig['plugins']> = [
  'typescript',
  'import',
  'unicorn',
  'vitest',
  'jsdoc',
  'node',
  'oxc',
  'effecttsgo',
  'promise',
]

export const options: NonNullable<OxlintConfig['options']> = {
  typeAware: true,
}

const stockRules: NonNullable<OxlintConfig['rules']> = {
  'vitest/no-standalone-expect': 'off',
  'typescript/no-explicit-any': 'error',
  'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  'typescript/no-unsafe-argument': 'error',
  'typescript/no-unsafe-assignment': 'error',
  'typescript/no-unsafe-call': 'error',
  'typescript/no-unsafe-member-access': 'error',
  'typescript/no-unsafe-return': 'error',
  'typescript/no-non-null-assertion': 'error',
  'typescript/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 10,
    },
  ],
  'unicorn/no-abusive-eslint-disable': 'error',
  'typescript/no-floating-promises': 'error',
  'typescript/no-misused-promises': 'error',
  'typescript/await-thenable': 'error',
  'typescript/only-throw-error': 'error',
  'no-throw-literal': 'error',
  'typescript/no-unnecessary-condition': 'error',
  'typescript/strict-boolean-expressions': 'error',
  'typescript/no-unnecessary-type-assertion': 'error',
  'typescript/switch-exhaustiveness-check': [
    'error',
    { allowDefaultCaseForExhaustiveSwitch: false, considerDefaultExhaustiveForUnions: false },
  ],
  'typescript/no-base-to-string': 'error',
  'import/no-cycle': 'error',
  'import/no-mutable-exports': 'error',
  'no-var': 'error',
}

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...stockRules,
  ...effectSchema.configs.recommended.rules,
  ...dmmfWorkflow.configs.recommended.rules,
  ...testDiscipline.configs.recommended.rules,
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

const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/tests/**',
] as const

const complexityOverrides: NonNullable<OxlintConfig['overrides']> = [
  {
    files: ['**/src/**'],
    rules: { complexity: ['error', { max: 2, variant: 'modified' }] },
  },
  ...dmmfWorkflow.configs.recommended.overrides,
  {
    files: [...testFilePatterns],
    rules: { complexity: 'off' },
  },
]

const sourceAndTestOverrides: NonNullable<OxlintConfig['overrides']> = [
  {
    files: ['**/src/**', '**/*.test.ts'],
    rules: {
      ...rules,
      ...promoteWarnToError(tsgoCorrectness.rules),
      'effecttsgo/global-date-in-effect': 'error',
      'effecttsgo/global-timers-in-effect': 'error',
      'effecttsgo/new-promise': 'error',
    },
  },
]

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

export const overrides: NonNullable<OxlintConfig['overrides']> = [
  ...sourceAndTestOverrides,
  ...observerOverrides,
  ...complexityOverrides,
]

const dmmf: OxlintConfig = {
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...options },
  categories: { correctness: 'error' },
  overrides: [...overrides],
  ignorePatterns: [...ignorePatterns],
}

export default dmmf
