import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
  './Atom': './dist/Atom.d.ts',
  './AtomRef': './dist/AtomRef.d.ts',
  './AtomRpc': './dist/AtomRpc.d.ts',
  './AtomHttpApi': './dist/AtomHttpApi.d.ts',
  './Hydration': './dist/Hydration.d.ts',
  './Registry': './dist/Registry.d.ts',
  './Result': './dist/Result.d.ts',
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(typesMap)) {
    const entry = exports[subpath]
    if (typeof entry === 'string') {
      exports[subpath] = { types, default: entry }
    } else if (typeof entry === 'object' && entry !== null) {
      const { default: defaultEntry, types: _existingTypes, ...rest } = entry
      const withDefault = typeof defaultEntry === 'string' ? { default: defaultEntry } : {}
      exports[subpath] = { ...rest, types, ...withDefault }
    }
  }
  return exports
}

export default defineConfig({
  entry: {
    index: './src/index.ts',
    Atom: './src/Atom.ts',
    AtomRef: './src/AtomRef.ts',
    AtomRpc: './src/AtomRpc.ts',
    AtomHttpApi: './src/AtomHttpApi.ts',
    Hydration: './src/Hydration.ts',
    Registry: './src/Registry.ts',
    Result: './src/Result.ts',
  },
  format: 'esm',
  dts: true,
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  clean: false,
})
