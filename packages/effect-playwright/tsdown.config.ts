import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const apiExtractorRollups: Record<string, string> = {
  '.': './dist/effect-playwright.d.ts',
  './experimental': './dist/experimental.d.ts',
  './test': './dist/test.d.ts',
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
    experimental: './src/experimental/index.ts',
    test: './src/test.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  // In-source tests must not ship: the runtime branch reads import.meta.vitest.
  define: {
    'import.meta.vitest': 'undefined',
  },
  exports: { devExports: '@systemfsoftware/source', customExports: shapeExports },
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
