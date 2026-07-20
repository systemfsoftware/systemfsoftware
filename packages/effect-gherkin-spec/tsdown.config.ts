import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const entry = exports['.']
  if (typeof entry === 'string') {
    exports['.'] = { types: './dist/index.d.ts', default: entry }
  } else if (typeof entry === 'object' && entry !== null) {
    exports['.'] = { ...entry, types: './dist/index.d.ts' }
  }
  return exports
}

export default defineConfig({
  entry: { index: './src/mod.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  clean: false,
  define: { 'import.meta.vitest': 'undefined' },
})
