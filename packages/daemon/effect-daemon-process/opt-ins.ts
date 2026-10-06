export default [
  {
    name: 'unstable-process',
    owner: '@ryanleecode',
    reason:
      'effect-daemon-process supervises child processes: src and tests build ChildProcess and ChildProcessSpawner values, both @stability unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/process' },
  },
]
