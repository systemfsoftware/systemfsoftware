import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'child-process-proxy-worker-main': './src/worker-pool/child-process-proxy-worker-main.ts',
    'checker-worker': './src/checker/checker-worker.ts',
    'child-process-test-runner-worker': './src/test-runner/child-process-test-runner-worker.ts',
    'config/base': './src/config/base-preset.ts',
    'config/config-resolution': './src/config/config-resolution.ts',
    'config/fork-schema': './src/config/fork-schema.ts',
    'plugins': './src/plugins/index.ts',
    'mutants/incremental-differ': './src/mutants/incremental-differ.ts',
    'output-mode': './src/output-mode.ts',
    'verdict-envelope': './src/verdict-envelope.ts',
    'run-event': './src/run-event.ts',
    'stryker-package': './src/stryker-package.ts',
    'exit-classification': './src/exit-classification.ts',
    'errors': './src/errors.ts',
    'timer': './src/timer.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  // Inlined, not externalized: see the note in ../typescript-checker/tsdown.config.ts.
  noExternal: ['@std/jsonc'],
  // Clean the dist before each build: with clean: false, content-hashed chunks
  // accumulate and a stale chunk (e.g. the pre-U6 reporters-*.mjs importing
  // chalk and progress) trips check:runtime-deps against a manifest that no
  // longer declares those deps.
  clean: true,
  // In-source `if (import.meta.vitest)` blocks are test code. Defining the
  // flag away makes every such branch statically dead, so rolldown drops it
  // along with its dynamic `import('vitest')`. Without this the blocks ship,
  // including those bundled from a workspace dependency's sources.
  define: { 'import.meta.vitest': 'undefined' },
})
