import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

// The published types entry is tsdown's own emit, as in @systemfsoftware/effect-e2e: api-extractor
// runs for the API report in `etc/` only.
const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const entry = exports['.']
  if (typeof entry === 'string') {
    exports['.'] = { types: './dist/index.d.ts', default: entry }
  } else if (typeof entry === 'object' && Boolean(entry)) {
    const { default: defaultEntry, types: _existingTypes, ...rest } = entry
    exports['.'] = {
      ...rest,
      types: './dist/index.d.ts',
      ...(typeof defaultEntry === 'string' ? { default: defaultEntry } : {}),
    }
  }
  return exports
}

export default defineConfig({
  ...quietBuild,
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
  define: { 'import.meta.vitest': 'undefined' },
})
