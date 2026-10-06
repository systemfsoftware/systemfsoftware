export default [
  {
    name: 'unstable-arbitrary',
    owner: '@ryanleecode',
    reason:
      'the sfs vitest runner drives property tests through effect/Arbitrary; both its app and test projects are entrypoint-role and Effect 4.0.1 tags the module unstable.',
    grant: { _tag: 'UnstableApi', api: 'effect/Arbitrary', role: 'test' },
  },
]
