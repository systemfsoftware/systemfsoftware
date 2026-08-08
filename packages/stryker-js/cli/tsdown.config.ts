import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: false,
  entry: {
    main: './src/main.ts',
  },
  exports: {
    exclude: ['main'],
    bin: { stryker: './src/main.ts' },
  },
  deps: {
    onlyBundle: false,
  },
  format: 'esm',
  dts: false,
  outExtensions: () => ({ js: '.mjs' }),
  tsconfig: './tsconfig.build.json',
  define: { 'import.meta.vitest': 'undefined' },
})
