export default [
  {
    name: 'cli-provides-node-services',
    owner: '@ryanleecode',
    reason:
      'src/cli.ts is the bin entry point: it provides the Node services layer to the diagrams program once, at the process edge, which is where strictEffectProvide allows Effect.provide.',
    grant: { _tag: 'DiagnosticExclusion', diagnostic: 'strictEffectProvide', role: 'library', files: ['src/cli.ts'] },
  },
  {
    name: 'unstable-cli',
    owner: '@ryanleecode',
    reason:
      'src/cli.ts parses the build and check subcommands and the --dir flag with effect/cli, the first-party Effect CLI parser; Effect 4.0.1 tags effect/cli unstable and ships no stable argument parser.',
    grant: { _tag: 'UnstableApi', api: 'effect/cli', role: 'library' },
  },
]
