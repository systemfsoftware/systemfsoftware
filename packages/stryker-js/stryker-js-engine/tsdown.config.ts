import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, entry] of Object.entries(exports)) {
    if (subpath === './package.json') continue
    if (typeof entry === 'string') {
      exports[subpath] = { types: entry.replace(/\.mjs$/, '.d.mts'), default: entry }
    } else if (typeof entry === 'object') {
      const { default: defaultEntry, types: _existingTypes, ...rest } = entry
      if (typeof defaultEntry !== 'string') continue
      exports[subpath] = { ...rest, types: defaultEntry.replace(/\.mjs$/, '.d.mts'), default: defaultEntry }
    }
  }
  return exports
}

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'config/base': './src/config/base.ts',
    'builtin-reporters': './src/builtin-reporters.ts',
    worker: './src/worker-wiring.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  noExternal: ['@std/jsonc'],
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
