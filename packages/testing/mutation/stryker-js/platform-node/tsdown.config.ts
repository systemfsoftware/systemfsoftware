import { defineConfig } from 'tsdown'

const WORKER_ENTRIES = [
  './internal/checker-worker',
  './internal/child-process-test-runner-worker',
]

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'config/base': './src/config/base.ts',
    'internal/checker-worker': './src/Checker.worker.ts',
    'internal/child-process-test-runner-worker': './src/child-process-test-runner-worker.ts',
  },
  format: 'esm',
  dts: true,
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: (exports: Record<string, unknown>) => {
      for (const entry of WORKER_ENTRIES) delete exports[entry]
      return exports
    },
  },
  noExternal: ['@std/jsonc'],
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
