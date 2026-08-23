import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  clean: true,
})
