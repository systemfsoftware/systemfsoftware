import { injectTypes } from '@systemfsoftware/tsdown-config/inject-types'
import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

export default defineConfig({
  ...quietBuild,
  entry: { index: './src/mod.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  define: { 'import.meta.vitest': 'undefined' },
})
