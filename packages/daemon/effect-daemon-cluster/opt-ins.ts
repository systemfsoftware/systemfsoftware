export default [
  {
    name: 'unstable-cluster',
    owner: '@ryanleecode',
    reason:
      'effect-daemon-cluster drives effect/cluster: src and tests build Sharding, SingleRunner and MessageStorage values, all @stability unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/cluster' },
  },
  {
    name: 'unstable-sql-pglite',
    owner: '@ryanleecode',
    reason:
      'effect-daemon-cluster tests a cluster backed by PgliteClient; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem.',
    grant: { _tag: 'UnstableApi', api: '@effect/sql-pglite', role: 'test' },
  },
]
