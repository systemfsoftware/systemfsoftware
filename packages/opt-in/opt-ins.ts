export default [
  {
    name: 'test-spawns-the-effect-tsgo-binary',
    owner: '@ryan',
    reason:
      'The integration scenario runs the real effect-tsgo binary, whose effect/process API is unstable in Effect 4.0.1.',
    grant: { _tag: 'UnstableApi', api: 'effect/process', role: 'test' },
  },
]
