import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  exports: { devExports: '@systemfsoftware/source' },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
})
