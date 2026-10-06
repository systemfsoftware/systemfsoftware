export default [
  {
    name: 'cli-provides-node-services',
    owner: '@ryanleecode',
    reason:
      'src/cli.ts is the bin entry point: it provides the Node services layer to the diagrams program once, at the process edge, which is where strictEffectProvide allows Effect.provide.',
    grant: { _tag: 'DiagnosticExclusion', diagnostic: 'strictEffectProvide', role: 'library', files: ['src/cli.ts'] },
  },
]
