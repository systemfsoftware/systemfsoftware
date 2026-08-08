import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'child-process-proxy-worker': './src/child-proxy/child-process-proxy-worker.ts',
    'checker-worker': './src/checker/checker-worker.ts',
    'child-process-test-runner-worker': './src/test-runner/child-process-test-runner-worker.ts',
    'config/base': './src/config/base-preset.ts',
    'config/config-resolution': './src/config/config-resolution.ts',
    'config/fork-schema': './src/config/fork-schema.ts',
    errors: './src/errors.ts',
    'mutants/incremental-differ': './src/mutants/incremental-differ.ts',
    'output-mode': './src/output-mode.ts',
    'reporters/stryker-plugins': './src/reporters/stryker-plugins.ts',
    'reporters/verdict-envelope': './src/reporters/verdict-envelope.ts',
    'run-event': './src/run-event.ts',
    'stryker-package': './src/stryker-package.ts',
    'utils/exit-classification': './src/utils/exit-classification.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  // Inlined, not externalized: see the note in ../typescript-checker/tsdown.config.ts.
  noExternal: ['@std/jsonc'],
  clean: false,
})
