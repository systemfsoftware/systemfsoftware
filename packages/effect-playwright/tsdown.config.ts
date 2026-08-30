import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
  './experimental': './dist/experimental/index.d.ts',
  './test': './dist/test.d.ts',
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
  entry: ['src/index.ts', 'src/experimental/index.ts', 'src/test.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // In-source tests must not ship: the runtime branch reads import.meta.vitest.
  define: {
    'import.meta.vitest': 'undefined',
  },
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      '@playwright/test',
      'effect',
      'playwright-core',
    ],
  },
})
