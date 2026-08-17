import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

// Each subpath's `types` points at the matching api-extractor rollup, not the
// raw tsdown d.ts: api-extractor is what trims and audits the published
// surface, and the four rollup configs must stay in lockstep with this map.
const apiExtractorRollups: Record<string, string> = {
  '.': './dist/rightsize.d.ts',
  './modules': './dist/modules.d.ts',
  './backend-docker': './dist/backend-docker.d.ts',
  './backend-msb': './dist/backend-msb.d.ts',
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
    index: './src/index.ts',
    modules: './src/modules.ts',
    'backend-docker': './src/backend-docker.ts',
    'backend-msb': './src/backend-msb.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  // Chunk filenames are content-hashed, so stale output is never overwritten:
  // `files: ["dist"]` then ships orphans importing undeclared specifiers.
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
