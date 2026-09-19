import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const injectTypesEntry = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const entry = exports['.']
  if (typeof entry === 'string') {
    exports['.'] = { types: './dist/index.d.ts', default: entry }
  } else if (typeof entry === 'object') {
    const { default: defaultEntry, types: _existingTypes, ...rest } = entry
    const withDefault = typeof defaultEntry === 'string' ? { default: defaultEntry } : {}
    exports['.'] = { ...rest, types: './dist/index.d.ts', ...withDefault }
  }
  return exports
}

export default defineConfig({
  entry: {
    index: './src/index.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypesEntry,
  },
})
