import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/effect-memfs.d.ts',
}

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
  return exports
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
  deps: {
    onlyBundle: false,
  },
  // `devExports` keeps the source condition in `exports` for in-repo resolution and
  // emits a `publishConfig.exports` without it. Without this block tsdown writes no
  // publish override, so the condition ships: a consumer whose tsconfig or bundler
  // enables it resolves to `./src/index.ts`, which the tarball does not contain.
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypes,
  },
})
