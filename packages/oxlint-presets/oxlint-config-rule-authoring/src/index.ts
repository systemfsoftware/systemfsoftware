import type { OxlintConfig } from 'oxlint'

export const ignorePatterns: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/lib/**',
  '**/esm/**',
  '**/cjs/**',
  '**/build/**',
  '**/out/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.stryker-tmp/**',
  '**/*.d.ts',
  '**/*.tsbuildinfo',
  '**/*.mjs',
  '**/.claude/**',
  '**/.opencode/**',
  '**/.sisyphus/**',
  '**/.repo/**',
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
  'node/no-sync': 'error',
}

const config: OxlintConfig = {
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
        'node/no-sync': 'off',
      },
    },
  ],
}

export default config
