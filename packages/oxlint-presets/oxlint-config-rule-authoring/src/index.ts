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

const testBlockFunctions = [
  'And',
  'But',
  'Given',
  'Then',
  'When',
  'describe',
  'flakyTest',
  'it',
  'law',
  'layer',
  'prop',
  'test',
] as const

export const rules: NonNullable<OxlintConfig['rules']> = {
  'vitest/no-standalone-expect': ['error', { additionalTestBlockFunctions: [...testBlockFunctions] }],
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
}

export default config
