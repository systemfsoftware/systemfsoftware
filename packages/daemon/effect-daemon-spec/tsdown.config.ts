import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(typesMap)) {
    const entry = exports[subpath]
    if (typeof entry === 'string') {
      exports[subpath] = { types, default: entry }
    } else if (typeof entry === 'object' && Boolean(entry)) {
      const { default: defaultEntry, types: _existingTypes, ...rest } = entry
      let withDefault: Record<string, string> = {}
      if (typeof defaultEntry === 'string') {
        withDefault = { default: defaultEntry }
      }
      exports[subpath] = { ...rest, types, ...withDefault }
    }
  }
  return exports
}

export default defineConfig({
  ...quietBuild,
  entry: {
    index: './src/mod.ts',
  },
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
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
