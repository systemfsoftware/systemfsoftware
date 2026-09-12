import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  entry: {
    main: './src/main.ts',
    'workers/checker-worker': './src/workers/Checker.worker.ts',
    'workers/child-process-test-runner-worker': './src/workers/child-process-test-runner-worker.ts',
    config: './src/config/base.ts',
  },
  exports: {
    exclude: ['main', 'workers/checker-worker', 'workers/child-process-test-runner-worker', 'config'],
    bin: { stryker: './src/main.ts' },
    customExports: { './config': './dist/config.mjs' },
  },
  deps: {
    alwaysBundle: ['effect', '@std/jsonc'],
    neverBundle: [
      'oxc-parser',
      'mutation-testing-elements',
      '@effect/platform-node',
      '@effect/platform-node-shared',
      '@systemfsoftware/effect-cell-types',
      '@eslint-community/regexpp',
      '@opentelemetry/api',
      '@noble/hashes',
      'diff-match-patch',
      'minimatch',
    ],
  },
  format: 'esm',
  dts: false,
  outExtensions: () => ({ js: '.mjs' }),
  tsconfig: './tsconfig.build.json',
  define: { 'import.meta.vitest': 'undefined' },
})
