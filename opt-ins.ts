export default [
  {
    name: 'type-refusal-fixtures-declare-their-own-errors',
    owner: '@ryanleecode',
    reason:
      'Compile-refusal fixtures prove a shape is rejected by holding a deliberate type error under @ts-expect-error. Their scope is excluded from the debt scan in debt-ledger.config.ts; this opt-in records the owner and reason for that exclusion so it is a declared decision, not a silent omission.',
    grant: {
      _tag: 'TypeRefusalFixtures',
      files: [
        'packages/runner/vitest-conformance/tests/__fixtures__/**',
        'packages/gherkin/effect-gherkin-spec/tests/__fixtures__/**',
        'packages/gherkin/storybook-gherkin/test/browser/scenario-title.deny.ts',
      ],
    },
  },
]
