import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

/**
 * tsdown writes `package.json#exports` from this object. The single public
 * entry is `.` (`src/mod.ts`); the build renames tsdown's default `./mod`
 * subpath to `.` and injects the emitted declaration path, so the generated map
 * stays the only `exports` the package has (REPO-S4).
 */
const rootExport = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const mod = exports['./mod']
  if (mod !== undefined && exports['.'] === undefined) {
    delete exports['./mod']
    exports['.'] = mod
  }
  return exports
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const entry = exports['.']
  if (typeof entry === 'string') {
    exports['.'] = { types: './dist/mod.d.ts', default: entry }
  } else if (typeof entry === 'object' && Boolean(entry)) {
    const { default: defaultEntry, types: _existingTypes, ...rest } = entry
    const withDefault = typeof defaultEntry === 'string' ? { default: defaultEntry } : {}
    exports['.'] = { ...rest, types: './dist/mod.d.ts', ...withDefault }
  }
  return exports
}

export default defineConfig({
  ...quietBuild,
  entry: { mod: './src/mod.ts' },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: {
    onlyBundle: false,
  },
  define: { 'import.meta.vitest': 'undefined' },
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: (exports: Record<string, ExportEntry>) => injectTypes(rootExport(exports)),
  },
})
