import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/effect-schema-recursion-budget.d.ts',
  './runtime': './dist/recursion-budget-runtime.d.ts',
}

const RUNTIME_ENTRY = './recursion-budget-runtime'
const RUNTIME_SUBPATH = './runtime'

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const runtimeEntry = exports[RUNTIME_ENTRY]
  if (runtimeEntry !== undefined) {
    exports[RUNTIME_SUBPATH] = runtimeEntry
    delete exports[RUNTIME_ENTRY]
  }
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
  entry: { index: './src/mod.ts', 'recursion-budget-runtime': './src/recursion-budget-runtime.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  clean: false,
  define: { 'import.meta.vitest': 'undefined' },
})
