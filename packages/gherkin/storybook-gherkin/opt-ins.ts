export default [
  {
    name: 'storybook-registers-stories',
    owner: '@ryanleecode',
    reason: "Storybook's vitest plugin registers every story with its own runner, which the KTD8 guard refuses.",
    grant: {
      _tag: 'VitestGuardExemption',
      projects: ['storybook'],
      registrar: "Storybook's vitest plugin registers every story",
    },
  },
]
