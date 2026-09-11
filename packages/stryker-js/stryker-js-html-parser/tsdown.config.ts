import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: true,
  exports: true,
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
