export default [
  {
    name: 'unstable-socket',
    owner: '@ryanleecode',
    reason:
      'effect-daemon-socket speaks the socket protocol: src and tests build Socket, SocketError and SocketServer values, all @stability unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/socket' },
  },
  {
    name: 'unstable-net',
    owner: '@ryanleecode',
    reason:
      'effect-daemon-socket addresses peers by NetAddress in shipped src; Effect 4.0.1 tags effect/net unstable and no stable address type exists.',
    grant: { _tag: 'UnstableApi', api: 'effect/net', role: 'library' },
  },
]
