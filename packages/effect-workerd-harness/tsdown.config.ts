import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesOf: Record<string, string> = {
  '.': './dist/index.d.ts',
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(typesOf)) {
    const current = exports[subpath]
    if (typeof current === 'string') {
      exports[subpath] = { types, default: current }
    } else if (typeof current === 'object' && Boolean(current)) {
      const { default: defaultEntry, types: _existingTypes, ...rest } = current
      exports[subpath] = typeof defaultEntry === 'string'
        ? { ...rest, types, default: defaultEntry }
        : { ...rest, types }
    }
  }
  return exports
}

export default defineConfig({
  ...quietBuild,
  entry: { index: './src/mod.ts' },
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
    customExports: injectTypes,
  },
})
