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
]
