import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const out: Record<string, ExportEntry> = {}
  for (const [subpath, types] of Object.entries(typesMap)) {
    const entry = exports[subpath]
    if (typeof entry === 'string') {
      out[subpath] = { types, default: entry }
      continue
    }
    const { default: defaultEntry, ...rest } = entry
    if (typeof defaultEntry === 'string') {
      out[subpath] = { ...rest, types, default: defaultEntry }
    } else {
      out[subpath] = { ...rest, types }
    }
  }
  return out
}

export default defineConfig({
  entry: {
    index: './src/index.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  clean: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  define: { 'import.meta.vitest': 'undefined' },
  deps: {
    onlyBundle: false,
  },
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
  },
})
