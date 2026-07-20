import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: false,
  exports: { devExports: '@systemfsoftware/source' },
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  define: { 'import.meta.vitest': 'undefined' },
})
