import all from '@systemfsoftware/all'

export default {
  ...all,
  rules: {
    ...all.rules,
    '@systemfsoftware/oxlint-plugin-property-testing/no-unbounded-fanout': [
      'error',
      { exempt: ['Schema.schema.ts'] },
    ],
  },
}
