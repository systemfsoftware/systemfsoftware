import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/mod.ts',
    'effect-schema-ignorer': './src/effect-schema-ignorer/index.ts',
  },
  format: 'esm',
  dts: { tsgo: { path: 'tsc' } },
  tsconfig: './tsconfig.build.json',
  clean: false,
  exports: { devExports: '@systemfsoftware/source' },
  deps: {
    onlyBundle: false,
  },
})
