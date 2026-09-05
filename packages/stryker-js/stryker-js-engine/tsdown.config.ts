import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'config/base': './src/config/base.ts',
    'builtin-reporters': './src/builtin-reporters.ts',
    worker: './src/worker-wiring.ts',
  },
  format: 'esm',
  dts: true,
  exports: {
    devExports: '@systemfsoftware/source',
  },
  noExternal: ['@std/jsonc'],
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
