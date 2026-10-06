export default [
  {
    name: 'unstable-sql',
    owner: '@ryanleecode',
    reason:
      'the postgres adapter and the law controls run the unit over SqlClient; Effect 4.0.1 tags effect/sql unstable and no stable SQL client exists.',
    grant: { _tag: 'UnstableApi', api: 'effect/sql' },
  },
  {
    name: 'unstable-sql-pglite',
    owner: '@ryanleecode',
    reason:
      'the store tests run the Postgres adapter against an in-process PGlite server; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem.',
    grant: { _tag: 'UnstableApi', api: '@effect/sql-pglite', role: 'test' },
  },
]
