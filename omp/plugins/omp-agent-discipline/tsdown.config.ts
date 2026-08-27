import { eagerEntryBudget } from '@systemfsoftware/tsdown-config/eager-entry-budget'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: false,
  exports: { devExports: '@systemfsoftware/source' },
  tsconfig: './tsconfig.build.json',
  minify: true,
  clean: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: {
    onlyBundle: false,
    alwaysBundle: [
      /^effect$/,
      /^effect\//,
      /^@effect\//,
      /^@systemfsoftware\/effect-cell-types(\/|$)/,
      /^@systemfsoftware\/effect-harness-policy(\/|$)/,
      /^@systemfsoftware\/omp-runtime(\/|$)/,
      /^@systemfsoftware\/agent-discipline(\/|$)/,
      /^@std\/toml(\/|$)/,
    ],
  },
  plugins: [eagerEntryBudget()],
  define: { 'import.meta.vitest': 'undefined' },
})
