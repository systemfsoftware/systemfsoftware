export default [
  {
    name: 'shared-config-passes-with-no-tests',
    owner: '@ryanleecode',
    reason:
      'The pr lane leaves some packages without a spec to run, and a package that keeps no test file must still pass.',
    grant: { _tag: 'PassWithNoTests' },
  },
]
