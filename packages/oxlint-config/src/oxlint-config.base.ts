import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
  },

  options: {
    typeAware: true,
  },

  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn'],

  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin'),
    import.meta.resolve('@systemfsoftware/oxlint-plugin-test-hygiene'),
  ],

  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'typescript/no-unnecessary-boolean-literal-compare': 'off',
    'typescript/no-explicit-any': 'error',
    'jest/no-standalone-expect': 'off',
    'jest/valid-expect': 'off',

    '@systemfsoftware/oxlint-plugin/ban-classes': ['error', { whitelist: ['WsCtor'] }],
    '@systemfsoftware/oxlint-plugin/ban-data-taggederror': 'error',
    '@systemfsoftware/oxlint-plugin/ban-effect-schema-imports': 'error',
    '@systemfsoftware/oxlint-plugin/ban-error-string': 'error',
    '@systemfsoftware/oxlint-plugin/no-manual-tag-property': 'error',
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
    '@systemfsoftware/oxlint-plugin-test-hygiene/damp-test-naming': 'error',
    '@systemfsoftware/oxlint-plugin-test-hygiene/pbt-naming': 'error',
    '@systemfsoftware/oxlint-plugin/policy-no-domain-imports': 'error',
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
        // The Gherkin step DSL and Effect.runSync-based helpers nest `expect`
        // inside Effect callbacks — vitest plugin cannot statically see these
        // as test blocks. Assertions are real; the rules don't model them.
        'vitest/expect-expect': 'off',
        'vitest/no-standalone-expect': 'off',
      },
    },
  ],

  ignorePatterns: [
    // Dependencies
    '**/node_modules/**',

    // Build outputs
    '**/dist/**',
    '**/lib/**',
    '**/esm/**',
    '**/cjs/**',
    '**/build/**',
    '**/out/**',
    '**/.tshy/**',
    '**/.tshy-build/**',

    // Monorepo tooling
    '**/.turbo/**',

    // Test & coverage
    '**/coverage/**',
    '**/.stryker-tmp/**',
    '**/__pycache__/**',

    // Generated types
    '**/*.d.ts',
    '**/*.tsbuildinfo',

    // AI assistants
    '**/.claude/**',
    '**/.opencode/**',
    '**/.sisyphus/**',

    // Project-specific
    '**/.repo/**',
    '**/.worktrees/**',
    '**/.issues/**',
    '**/.papi/**',
    '**/submodules/**',
    '**/repos/**',
  ],
})
