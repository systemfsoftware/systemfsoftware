export default [
  {
    name: 'gherkin-steps-are-test-blocks',
    owner: '@ryanleecode',
    reason:
      "This configuration runs the repo's Gherkin registrars (Given/When/Then/And/But) and the fork's prop/law/layer/flakyTest, so vitest/no-standalone-expect must treat those names as test blocks or it reports every step that asserts.",
    grant: { _tag: 'PresetNarrowing', rule: 'vitest/no-standalone-expect', files: [] },
  },
]
