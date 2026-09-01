import { defineConfig } from 'tsdown'

export default defineConfig({
  // Stale chunks are published: `dist/` is what ships, and a chunk left from an
  // earlier build stays in the tarball. This package shipped a megabyte of
  // bundled test-runner internals that way, long after the code that pulled
  // them in was gone.
  clean: true,
  entry: {
    main: './src/main.ts',
    'workers/checker-worker': './src/workers/Checker.worker.ts',
    'workers/child-process-test-runner-worker': './src/workers/child-process-test-runner-worker.ts',
  },
  exports: {
    exclude: ['main', 'workers/checker-worker', 'workers/child-process-test-runner-worker'],
    bin: { stryker: './src/main.ts' },
  },
  deps: {
    onlyBundle: false,
  },
  format: 'esm',
  dts: false,
  outExtensions: () => ({ js: '.mjs' }),
  tsconfig: './tsconfig.build.json',
  define: { 'import.meta.vitest': 'undefined' },
})
