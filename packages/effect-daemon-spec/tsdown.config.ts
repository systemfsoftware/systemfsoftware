import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const apiExtractorRollups: Record<string, string> = {
  '.': './dist/effect-daemon-spec.d.ts',
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
  clean: false,
  entry: {
    index: './src/mod.ts',
  },
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectApiExtractorTypes,
  },
  deps: {
    onlyBundle: false,
  },
  format: 'esm',
  dts: true,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  define: { 'import.meta.vitest': 'undefined' },
})
