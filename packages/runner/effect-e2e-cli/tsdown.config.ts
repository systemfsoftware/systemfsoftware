import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const packageJsonOnly = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  delete exports['.']
  return exports
}

export default defineConfig({
  ...quietBuild,
  entry: { bin: './src/main.ts' },
  format: 'esm',
  dts: false,
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: packageJsonOnly,
    bin: false,
  },
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs' }),
  define: { 'import.meta.vitest': 'undefined' },
})
