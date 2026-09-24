import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

export default defineConfig({
  ...quietBuild,
  entry: { mod: './src/mod.ts' },
  define: { 'import.meta.vitest': 'undefined' },
  format: 'esm',
  platform: 'node',
  dts: false,
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.mjs' }),
  deps: { onlyBundle: false },
})
