import type { OxlintConfig } from 'oxlint'

/**
 * The one ignore list every preset in this repository carries on its default config. A config that lists a
 * preset under `extends` does not inherit it; a config that spreads it into its own `ignorePatterns` does.
 */
export const ignorePatterns: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.stryker-tmp/**',
  '**/*.tsbuildinfo',
  '**/.claude/**',
  '**/.worktrees/**',
  '**/repos/**',
]

export const plugins: NonNullable<OxlintConfig['plugins']> = [
  'typescript',
  'import',
  'jsdoc',
  'node',
  'promise',
  'vitest',
  'unicorn',
  'oxc',
]

export const rules: NonNullable<OxlintConfig['rules']> = {
  'vitest/no-standalone-expect': 'off',
  'typescript/ban-ts-comment': 'error',
  'typescript/consistent-type-assertions': [
    'error',
    {
      assertionStyle: 'never',
    },
  ],
  'typescript/no-explicit-any': 'error',
  'typescript/no-non-null-assertion': 'error',
}

const config: OxlintConfig = {
  options: {
    typeAware: true,
  },
  categories: {
    correctness: 'error',
  },
  plugins: [...plugins],
  rules: { ...rules },
  ignorePatterns: [...ignorePatterns],
  overrides: [
    {
      files: ['**/__tests__/**', '**/*.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
}

export default config
