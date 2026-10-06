export default [
  {
    name: 'unstable-arbitrary',
    owner: '@ryanleecode',
    reason:
      'effect-microsandbox generates property inputs with effect/Arbitrary in shipped src and src/__tests__; Effect 4.0.1 tags the whole module unstable with no stable counterpart.',
    grant: { _tag: 'UnstableApi', api: 'effect/Arbitrary' },
  },
]
