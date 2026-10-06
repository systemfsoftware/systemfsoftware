export default [
  {
    name: 'node-builtin-import-is-source-only',
    owner: '@ryanleecode',
    reason:
      'effecttsgo/node-builtin-import is a production-source rule: build-config files (vitest.config.ts, tsdown.config.ts) and scripts legitimately import node:path and friends, so the rule is enabled only under **/src/**.',
    grant: { _tag: 'PresetNarrowing', rule: 'effecttsgo/node-builtin-import', files: ['**/src/**'] },
  },
]
