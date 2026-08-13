import { defineConfig } from 'tsdown'
import { eagerEntryBudget } from '../../../scripts/tools/rolldown-eager-entry-budget.mjs'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: false,
  exports: { devExports: '@systemfsoftware/source' },
  tsconfig: './tsconfig.build.json',
  minify: true,
  clean: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: { onlyBundle: false, alwaysBundle: [/^effect$/, /^effect\//, /^@effect\//] },
  plugins: [eagerEntryBudget()],
  define: { 'import.meta.vitest': 'undefined' },
})
