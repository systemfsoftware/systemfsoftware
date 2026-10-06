export default {
  modules: [
    './packages/*/src/**/*.workflow.ts',
    './packages/*/*/src/**/*.workflow.ts',
    './examples/*/src/**/*.workflow.ts',
  ],
  outDir: './docs/diagrams',
}
