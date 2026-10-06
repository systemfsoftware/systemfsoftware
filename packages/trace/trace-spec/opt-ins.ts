export default [
  {
    name: 'unstable-arbitrary',
    owner: '@ryanleecode',
    reason:
      'trace-spec exports generated stimuli through effect/Arbitrary; its app project is entrypoint-role and Effect 4.0.1 tags the module unstable.',
    grant: { _tag: 'UnstableApi', api: 'effect/Arbitrary', role: 'test' },
  },
  {
    name: 'unstable-opentelemetry',
    owner: '@ryanleecode',
    reason:
      'trace-spec observes real OTel traces through OtelTracer and Resource; @effect/opentelemetry is @stability unstable and is the only OTel bridge.',
    grant: { _tag: 'UnstableApi', api: '@effect/opentelemetry' },
  },
  {
    name: 'unstable-net',
    owner: '@ryanleecode',
    reason:
      'trace-spec tests are addressed by NetAddress; Effect 4.0.1 tags effect/net unstable and the tests cannot express an endpoint without it.',
    grant: { _tag: 'UnstableApi', api: 'effect/net', role: 'test' },
  },
]
