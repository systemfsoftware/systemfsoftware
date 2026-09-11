import { correctness as tsgoCorrectness } from '@effect/tsgo/oxlint-presets'
import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
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

  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-dmmf'),
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

    '@systemfsoftware/oxlint-plugin/ban-error-string': 'error',
    '@systemfsoftware/oxlint-plugin/no-context-generic-tag': 'error',
    '@systemfsoftware/oxlint-plugin/no-date-now-in-effect': 'error',
    '@systemfsoftware/oxlint-plugin/no-direct-tag-access': 'error',
    '@systemfsoftware/oxlint-plugin/no-either-tag-assertions': 'error',
    '@systemfsoftware/oxlint-plugin/no-io-boundary-tests': 'error',
    '@systemfsoftware/oxlint-plugin/no-logging-in-catch': 'error',
    '@systemfsoftware/oxlint-plugin/no-new-promise-in-effect': 'error',
    '@systemfsoftware/oxlint-plugin/no-native-map-in-effect': 'error',
    '@systemfsoftware/oxlint-plugin/no-native-set-in-effect': 'error',
    '@systemfsoftware/oxlint-plugin/no-native-setinterval-in-effect': 'error',
    '@systemfsoftware/oxlint-plugin/no-native-settimeout-in-effect': 'error',
    '@systemfsoftware/oxlint-plugin/internal-export-jsdoc': 'error',
    '@systemfsoftware/oxlint-plugin/no-internal-jsdoc-outside': 'error',
    ...effectDmmf.configs.recommended.rules,

    ...promoteWarnToError(tsgoCorrectness.rules),

    '@systemfsoftware/oxlint-plugin/no-new-worker-with-wasm-import': 'error',
    '@systemfsoftware/oxlint-plugin/no-barrels': 'off',
    '@systemfsoftware/oxlint-plugin/no-inline-destructured-type': 'off',
  },

  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@systemfsoftware/oxlint-plugin/no-native-map-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin/no-native-set-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin/no-native-setinterval-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin/no-native-settimeout-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin/no-new-promise-in-effect': 'off',
        '@systemfsoftware/oxlint-plugin/no-direct-tag-access': 'off',
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
