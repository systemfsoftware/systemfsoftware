import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const entry = exports['.']
  if (typeof entry === 'string') {
    exports['.'] = { types: './dist/index.d.ts', default: entry }
  }
  return exports
}

export default defineConfig({
  entry: {
    index: './src/mod.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  exports: {
    customExports: injectTypes,
  },
  deps: {
    alwaysBundle: [/./],
  },
})
