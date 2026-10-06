import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
  './actors': './dist/actors.d.ts',
  './durable': './dist/durable.d.ts',
  './fsm': './dist/fsm.d.ts',
  './graph': './dist/graph.d.ts',
  './validation': './dist/validation.d.ts',
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
    index: './src/index.ts',
    actors: './src/actors/index.ts',
    durable: './src/durable/index.ts',
    fsm: './src/fsm/index.ts',
    graph: './src/graph/index.ts',
    validation: './src/validation/index.ts',
  },
  format: 'esm',
  dts: true,
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
})
