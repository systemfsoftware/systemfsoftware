import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined> | null

// One api-extractor rollup per published subpath. Each subpath's `types`
// condition points at its own rolled declaration, produced by the matching
// `api-extractor.<name>.json` config chained in the build script.
const apiExtractorRollups: Record<string, string> = {
  '.': './dist/effect-daemon-spec.d.ts',
  './SupervisionPolicy': './dist/SupervisionPolicy.rollup.d.ts',
  './LeaderLock': './dist/LeaderLock.rollup.d.ts',
  './DaemonReporter': './dist/DaemonReporter.rollup.d.ts',
  './DaemonSpec': './dist/DaemonSpec.rollup.d.ts',
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
  // The executors under src/internal/ are implementation detail. A null export
  // value seals the path: consumers get ERR_PACKAGE_PATH_NOT_EXPORTED.
  exports['./internal/*'] = null
  return exports
}

export default defineConfig({
  clean: false,
  entry: {
    index: './src/mod.ts',
    SupervisionPolicy: './src/supervision-policy/mod.ts',
    LeaderLock: './src/leader-lock/mod.ts',
    DaemonReporter: './src/daemon-reporter.adapter.ts',
    DaemonSpec: './src/daemon-spec/mod.ts',
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
