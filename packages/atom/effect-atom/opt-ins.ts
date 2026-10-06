export default [
  {
    name: 'unstable-rpc',
    owner: '@ryanleecode',
    reason:
      'effect-atom models RPC atoms: src and tests build Rpc, RpcGroup, RpcClient and RpcSerialization values, all @stability unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/rpc' },
  },
  {
    name: 'unstable-http-api',
    owner: '@ryanleecode',
    reason:
      'effect-atom models HTTP API atoms: src and tests build HttpApi, HttpApiGroup and HttpApiEndpoint values, all @stability unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/http-api' },
  },
  {
    name: 'unstable-reactivity',
    owner: '@ryanleecode',
    reason:
      'effect-atom keys atom reads on Reactivity in shipped src; Effect 4.0.1 tags effect/reactivity unstable and the atom runtime cannot avoid it.',
    grant: { _tag: 'UnstableApi', api: 'effect/reactivity', role: 'library' },
  },
  {
    name: 'unstable-persistence',
    owner: '@ryanleecode',
    reason:
      'effect-atom backs atoms with KeyValueStore in src and tests; Effect 4.0.1 tags effect/persistence unstable and no stable replacement exists.',
    grant: { _tag: 'UnstableApi', api: 'effect/persistence' },
  },
]
