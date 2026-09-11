import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/effect-schema-recursion-budget.d.ts',
}

const UNEXPORTED_ENTRIES: ReadonlyArray<string> = ['./recursion-budget-runtime']

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
  for (const unexported of UNEXPORTED_ENTRIES) delete exports[unexported]
  return exports
}

export default defineConfig({
  entry: { index: './src/mod.ts', 'recursion-budget-runtime': './src/recursion-budget-runtime.ts' },
  format: 'esm',
  dts: true,
  exports: { customExports: injectTypes },
  deps: { onlyBundle: false },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  clean: false,
  define: { 'import.meta.vitest': 'undefined' },
})
