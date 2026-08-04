import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const apiExtractorRollups: Record<string, string> = {
  '.': './dist/stryker-plugins.d.ts',
  './effect-schema-ignorer': './dist/effect-schema-ignorer.d.ts',
}

const BIN_SUBPATH = './test-contribution-gate'

const shapeExports = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  // The gate is an executable, not an importable module: it exports nothing, so a subpath
  // for it would advertise a type surface that cannot exist. It ships via `bin` instead.
  delete exports[BIN_SUBPATH]
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
    'effect-schema-ignorer': './src/effect-schema-ignorer/index.ts',
    'test-contribution-gate': './src/test-contribution/main.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: shapeExports,
  },
  deps: {
    onlyBundle: false,
  },
})
