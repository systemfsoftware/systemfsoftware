import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
}

/**
 * tsdown generates the exports map but does not put `types` in it, so the
 * published `exports["."]` would resolve to JS with no declarations even though
 * the build emits `dist/index.d.ts`. This injects the declaration entry so the
 * map cannot claim a surface the tarball does not ship.
 */
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
  // The root entry is the whole public surface. Declaring `exports` here is what
  // makes the build own the exports map, so a hand-edited map cannot drift from
  // what the build actually emits.
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // Unlike the analyser this package was extracted from, publishing a source
  // condition is safe here: nothing in `src` reaches a compiler's internal API,
  // so a consumer compiling these files inherits no errors.
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      '@andrewbranch/untar.js',
      'effect',
      'fflate',
    ],
  },
})
