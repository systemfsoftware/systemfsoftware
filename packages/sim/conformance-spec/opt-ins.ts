export default [
  {
    name: 'unstable-arbitrary',
    owner: '@ryanleecode',
    reason:
      'conformance-spec generates linearization inputs with effect/Arbitrary in its entrypoint-role src; Effect 4.0.1 tags the module unstable with no stable counterpart.',
    grant: { _tag: 'UnstableApi', api: 'effect/Arbitrary', role: 'test' },
  },
]
