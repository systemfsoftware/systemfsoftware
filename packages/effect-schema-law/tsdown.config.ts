import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const apiExtractorRollups: Record<string, string> = {
  '.': './dist/effect-schema-law.d.ts',
}

const injectApiExtractorTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(apiExtractorRollups)) {
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
  entry: { index: './src/mod.ts' },
  format: 'esm',
  dts: true,
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectApiExtractorTypes,
  },
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  clean: false,
  define: { 'import.meta.vitest': 'undefined' },
})
