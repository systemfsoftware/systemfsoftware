export default [
  {
    name: 'unstable-rpc',
    owner: '@ryanleecode',
    reason:
      'the example serves RPC over HTTP: src and tests build Rpc, RpcGroup, RpcClient and RpcServer values, all @stability unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/rpc' },
  },
  {
    name: 'unstable-sql-pglite',
    owner: '@ryanleecode',
    reason:
      'the example persists through PgliteClient in src and tests; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem.',
    grant: { _tag: 'UnstableApi', api: '@effect/sql-pglite' },
  },
  {
    name: 'unstable-platform-node',
    owner: '@ryanleecode',
    reason:
      'the example runs on and tests with NodeHttpClient/NodeHttpServer; @effect/platform-node is @stability unstable in the Effect 4.0.1 ecosystem.',
    grant: { _tag: 'UnstableApi', api: '@effect/platform-node' },
  },
]
