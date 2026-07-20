import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/mod.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  define: { 'import.meta.vitest': 'undefined' },
})
