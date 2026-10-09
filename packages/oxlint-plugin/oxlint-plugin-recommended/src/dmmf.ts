import dmmfWorkflowPlugin from '@systemfsoftware/oxlint-plugin-dmmf-workflow'
import effectSchemaPlugin from '@systemfsoftware/oxlint-plugin-effect-schema'
import type { OxlintConfig } from 'oxlint'

export const dmmfJsPlugins: readonly string[] = [
  import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-schema'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-dmmf-workflow'),
]

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

const dmmfRules: NonNullable<OxlintConfig['rules']> = {
  ...stockRules,
  ...effectSchemaPlugin.configs.recommended.rules,
  ...dmmfWorkflowPlugin.configs.recommended.rules,
}

const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/tests/**',
] as const

export const dmmf: OxlintConfig = {
  plugins: ['typescript', 'import', 'unicorn', 'jsdoc', 'node', 'oxc', 'promise'],
  jsPlugins: [...dmmfJsPlugins],
  options: { typeAware: true },
  categories: { correctness: 'error' },
  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: { ...dmmfRules },
    },
    {
      files: ['**/src/**'],
      rules: { complexity: ['error', { max: 2, variant: 'modified' }] },
    },
    ...dmmfWorkflowPlugin.configs.recommended.overrides,
    {
      files: [...testFilePatterns],
      rules: { complexity: 'off' },
    },
  ],
}
