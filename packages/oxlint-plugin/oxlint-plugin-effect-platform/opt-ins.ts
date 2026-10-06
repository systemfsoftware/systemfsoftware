export default [
  {
    name: 'rule-tester-registers-tests',
    owner: '@ryanleecode',
    reason: "oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses.",
    grant: {
      _tag: 'VitestGuardExemption',
      projects: '*',
      registrar: "oxlint's RuleTester registers every case with vitest's it",
    },
  },
  {
    name: 'node-restricted-imports-skips-fixtures',
    owner: '@ryanleecode',
    reason:
      'Compile-fixture and testResource trees hold the deliberate Node-builtin imports the rule forbids in production source, so no-restricted-imports is withheld from them; the override files already leave build-config files out of the rule.',
    grant: {
      _tag: 'PresetNarrowing',
      rule: 'no-restricted-imports',
      files: ['**/__fixtures__/**', '**/fixtures/**', '**/testResources/**'],
    },
  },
]
