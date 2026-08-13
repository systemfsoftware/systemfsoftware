import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

// The published types entry is tsdown's own emit, NOT an api-extractor rollup. api-extractor
// cannot express `export * as Ns` — its rollup flattens the namespace into a value, after which
// `Workflow.Workflow<C, D, E>` is TS2749 ("refers to a value, but is being used as a type") and
// every consumer's channels collapse to never. Measured on this package: with the rollup as the
// types entry, `test:types` and `stryker-js-cli`'s typecheck both fail. api-extractor still runs
// for the API report in `etc/`, which is the gate that matters; only its rollup is disabled.
const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
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
  entry: { index: './src/mod.ts' },
  format: 'esm',
  dts: true,
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
  },
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  clean: false,
  define: { 'import.meta.vitest': 'undefined' },
})
