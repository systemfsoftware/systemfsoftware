import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const apiExtractorRollups: Record<string, string> = {
  '.': './dist/stryker-test-contribution.d.ts',
}

const shapeExports = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
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
  entry: {
    index: './src/mod.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  clean: true,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: shapeExports,
  },
  deps: {
    onlyBundle: false,
  },
})
