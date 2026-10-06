export default [
  {
    name: 'unstable-socket',
    owner: '@ryanleecode',
    reason:
      'effect-readiness probes endpoints over Socket in src and tests; Effect 4.0.1 tags effect/socket unstable and no stable socket API exists.',
    grant: { _tag: 'UnstableApi', api: 'effect/socket' },
  },
  {
    name: 'unstable-net',
    owner: '@ryanleecode',
    reason:
      'effect-readiness tests address endpoints by NetAddress; Effect 4.0.1 tags effect/net unstable and the tests cannot express an endpoint without it.',
    grant: { _tag: 'UnstableApi', api: 'effect/net', role: 'test' },
  },
]
