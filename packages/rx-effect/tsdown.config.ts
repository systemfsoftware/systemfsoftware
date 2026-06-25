import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/mod.ts' },
  format: 'esm',
  dts: { tsgo: true },
  exports: { devExports: '@systemfsoftware/source' },
  tsconfig: './tsconfig.build.json',
  clean: false,
  deps: { onlyBundle: false },
  define: { 'import.meta.vitest': 'undefined' },
})
