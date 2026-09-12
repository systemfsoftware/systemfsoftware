import { correctness as tsgoCorrectness } from '@effect/tsgo/oxlint-presets'
import effectEntrypointPreset from '@systemfsoftware/oxlint-plugin-effect-entrypoint/preset'
import effectNativePreset from '@systemfsoftware/oxlint-plugin-effect-native/preset'
import effectSchemaPreset from '@systemfsoftware/oxlint-plugin-effect-schema/preset'
import effectWorkflowPreset from '@systemfsoftware/oxlint-plugin-effect-workflow/preset'
import propertyTestingPreset from '@systemfsoftware/oxlint-plugin-property-testing/preset'
import structurePreset from '@systemfsoftware/oxlint-plugin-structure/preset'
import tagDisciplinePreset from '@systemfsoftware/oxlint-plugin-tag-discipline/preset'
import testHygienePreset from '@systemfsoftware/oxlint-plugin-test-hygiene/preset'
import testPlacementPreset from '@systemfsoftware/oxlint-plugin-test-placement/preset'
import { defineConfig } from 'oxlint'

export const promoteWarnToError = (rules: Record<string, unknown> | undefined): Record<string, 'error' | 'off'> => {
  const out: Record<string, 'error' | 'off'> = {}
  if (!rules) return out
  for (const [key, severity] of Object.entries(rules)) {
    if (severity === 'warn') out[key] = 'error'
    else if (severity === 'error') out[key] = 'error'
    else if (severity === 'off') out[key] = 'off'
    else if (Array.isArray(severity) && severity[0] === 'warn') out[key] = 'error'
    else if (Array.isArray(severity) && severity[0] === 'error') out[key] = 'error'
    else if (Array.isArray(severity) && severity[0] === 'off') out[key] = 'off'
  }
  return out
}

export default defineConfig({
  categories: {
    correctness: 'error',
  },

  options: {
    typeAware: true,
  },

  plugins: ['typescript', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn', 'oxc', 'effecttsgo'],

  extends: [
    effectNativePreset,
    tagDisciplinePreset,
    structurePreset,
    effectSchemaPreset,
    effectWorkflowPreset,
    propertyTestingPreset,
    testHygienePreset,
    testPlacementPreset,
    effectEntrypointPreset,
  ],

  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'typescript/no-unnecessary-boolean-literal-compare': 'off',
    'typescript/explicit-module-boundary-types': 'off',
    'typescript/no-explicit-any': 'error',
    'jest/no-standalone-expect': 'off',
    'jest/valid-expect': 'off',
    'vitest/no-standalone-expect': 'off',

    'typescript/switch-exhaustiveness-check': 'error',

    'typescript/ban-ts-comment': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/no-unsafe-type-assertion': 'error',

    ...promoteWarnToError(tsgoCorrectness.rules),

    '@systemfsoftware/oxlint-plugin-effect-native/no-new-worker-with-wasm-import': 'error',
    '@systemfsoftware/oxlint-plugin-structure/no-barrels': 'off',
    '@systemfsoftware/oxlint-plugin-structure/no-inline-destructured-type': 'off',
  },

  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@systemfsoftware/oxlint-plugin-effect-native/no-native-map-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin-effect-native/no-native-set-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin-effect-native/no-native-setinterval-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin-effect-native/no-native-settimeout-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin-effect-native/no-new-promise-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin-tag-discipline/no-direct-tag-access': 'off',
        'vitest/expect-expect': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
      },
    },
    {
      files: ['**/fixtures/**', '**/__fixtures__/**', '**/testResources/**'],
      rules: {
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
      },
    },
  ],

  ignorePatterns: [
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

    '**/.claude/**',
    '**/.opencode/**',
    '**/.sisyphus/**',

    '**/.repo/**',
    '**/.worktrees/**',
    '**/.issues/**',
    '**/.papi/**',
    '**/submodules/**',
    '**/repos/**',
  ],
})
