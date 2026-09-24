import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/mod.d.ts',
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
    mod: './src/mod.ts',
  },
  define: { 'import.meta.vitest': 'undefined' },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: {
    onlyBundle: false,
  },
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
  },
})
