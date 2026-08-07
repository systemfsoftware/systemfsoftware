import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    // A second entry, not a convenience: `vitest-test-runner.ts` resolves this file as a
    // sibling of its own emitted module and copies it into the sandbox as vitest's setup
    // file. It must exist as a standalone artifact with no relative imports.
    'stryker-setup': './src/stryker-setup.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  clean: false,
})
