import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: './src/mod.ts',
  format: 'esm',
  dts: true,
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  clean: false,
  define: { 'import.meta.vitest': 'undefined' },
})
