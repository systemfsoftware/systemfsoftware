export default [
  {
    name: 'test-spawns-the-effect-tsgo-binary',
    owner: '@ryanleecode',
    reason:
      'effect-tsgo is a native binary with no in-process API, and proving the preset requires running the tool that reads it. Remove when @effect/tsgo ships an in-process API.',
    grant: {
      _tag: 'TestProcessSpawn',
      files: ['tests/sync-package-opt-ins.integration.test.ts'],
      rule: 'WGI-CLS1',
    },
  },
]
