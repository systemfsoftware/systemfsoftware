import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'child-process-proxy-worker': './src/child-proxy/child-process-proxy-worker.ts',
    'checker-worker': './src/checker/checker-worker.ts',
    'child-process-test-runner-worker': './src/test-runner/child-process-test-runner-worker.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  clean: false,
})
