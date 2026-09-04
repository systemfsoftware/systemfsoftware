import { defineConfig } from 'oxlint'

// The baseline for every package under `packages/lint/oxlint/plugins/`.
//
// These packages cannot extend `@systemfsoftware/oxlint-config`: they ARE the rules it
// loads, so declaring it closes a CO4 dependency cycle. `check-lint-coverage.mjs` exempts
// them for exactly that reason -- but the exemption only explains the missing edge, it
// never promised the packages go unlinted. Measured 2026-08-08: 20 of the 22 carried no
// config at all, so oxlint fell back to its defaults, which report `correctness` at
// `warning` and exit 0. Their `lint` script could not fail. This file is the baseline the
// exemption always implied, and it reaches them by config discovery rather than by a
// package edge, so the cycle stays closed.
//
// `typeAware` is deliberately absent. The base config turns it on, but these packages hold
// rule bodies -- ESTree visitors over an AST -- not Effect cell code, so the type-aware
// families buy little here and every one of them costs a tsgolint pass per package.
export default defineConfig({
  categories: {
    correctness: 'error',
  },

  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn', 'oxc'],

  rules: {
    'typescript/ban-ts-comment': 'error',
    'typescript/consistent-type-assertions': ['error', {
      assertionStyle: 'never',
    }],
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
  },

  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/lib/**',
    '**/build/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/*.d.ts',
    '**/*.tsbuildinfo',
    '**/.claude/**',
    '**/.opencode/**',
    '**/.sisyphus/**',
  ],

  // `_guards.test.ts` drives two node predicates directly, so it has to construct
  // ESTree nodes by hand. It cannot: every member of the `Node` union extends `Span`
  // and carries a REQUIRED, self-referential `parent`, so no literal satisfies the
  // type and the doubles are asserted into it. The rule stays on everywhere else --
  // this is the one file in the tree that fabricates an AST instead of parsing one.
  //
  // The standing fix is to delete the file: the same two predicates are already
  // exercised through real source by the RuleTester suite beside it, and this repo's
  // plugin convention is RuleTester over unit-testing internals. That deletion is
  // deferred, not declined -- `src/rules/*.ts` is inside the package's mutate scope,
  // so removing a test needs the mutation gate to show it costs no kills.
  overrides: [
    {
      files: ['testing/test-placement/src/rules/__tests__/_guards.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
})
