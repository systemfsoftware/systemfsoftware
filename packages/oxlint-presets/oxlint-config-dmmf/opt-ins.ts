export default [
  {
    name: 'complexity-skips-tests',
    owner: '@ryanleecode',
    reason:
      'The src complexity ceiling is a production-code budget: a test body arranges fixtures and asserts a sequence, which no small threshold admits, so complexity is withheld from test files instead of being switched off there.',
    grant: {
      _tag: 'PresetNarrowing',
      rule: 'complexity',
      files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**', '**/tests/**'],
    },
  },
  {
    name: 'gherkin-steps-are-test-blocks',
    owner: '@ryanleecode',
    reason:
      "The preset runs the repo's Gherkin registrars (Given/When/Then/And/But) and the fork's prop/law/layer/flakyTest, so vitest/no-standalone-expect must treat those names as test blocks or it reports every step that asserts.",
    grant: { _tag: 'PresetNarrowing', rule: 'vitest/no-standalone-expect', files: [] },
  },
]
