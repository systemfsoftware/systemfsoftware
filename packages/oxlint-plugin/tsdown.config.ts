import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
  },
  format: 'esm',
  dts: { tsgo: true },
  tsconfig: './tsconfig.build.json',
  clean: false,
  exports: {},
  deps: {
    onlyBundle: false,
  },
})
