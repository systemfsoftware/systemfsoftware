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
    main: './src/main.ts',
  },
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
    // The CLI is reached through `bin`, not through a subpath. Excluding `main` from the map is also
    // what puts the barrel at `.`: tsdown assigns the root subpath to an entry named `index` or to the
    // only entry, so dropping `main` makes `mod` the single one.
    exclude: ['main'],
    // `bin` is hand-written as `./dist/main.mjs`. Letting tsdown generate it would point the field at
    // `./src/main.ts` and add `publishConfig.bin` (its dev-mode rewrite), which the released package
    // does not want: a consumer has no source file to execute.
    bin: false,
  },
})
