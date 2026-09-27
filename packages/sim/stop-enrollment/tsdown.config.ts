import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesOf: Record<string, string> = {
  '.': './dist/index.d.ts',
  './bin': './dist/bin.d.ts',
}

const withTypes = (entry: ExportEntry | undefined, types: string): ExportEntry | undefined => {
  if (typeof entry === 'string') return { types, default: entry }
  if (entry === undefined) return entry
  const { default: defaultEntry, types: _existingTypes, ...rest } = entry
  return { ...rest, types, default: defaultEntry }
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(typesOf)) {
    const entry = withTypes(exports[subpath], types)
    if (entry !== undefined) exports[subpath] = entry
  }
  return exports
}

export default defineConfig({
  ...quietBuild,
  entry: { index: './src/mod.ts', bin: './src/bin.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes, bin: './src/bin.ts' },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  define: { 'import.meta.vitest': 'undefined' },
})
