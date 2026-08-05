import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'child-process-proxy-worker': './src/child-proxy/child-process-proxy-worker.ts',
    'checker-worker': './src/checker/checker-worker.ts',
    'child-process-test-runner-worker': './src/test-runner/child-process-test-runner-worker.ts',
    'config/base': './src/config/base-preset.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  // Inlined, not externalized: see the note in ../typescript-checker/tsdown.config.ts.
  noExternal: ['@std/jsonc'],
  clean: false,
})
