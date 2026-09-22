import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
  './cli': './dist/cli.d.ts',
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
  // Two entries own the public surface: the programmatic module and the
  // `api-extractor` binary. Declaring them here is what makes the build own the
  // exports map, so `bin` cannot point at a chunk the build never emits.
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      '@effect/platform',
      '@effect/platform-node',
      '@microsoft/tsdoc',
      '@microsoft/tsdoc-config',
      'diff',
      'effect',
      'minimatch',
      'semver',
      'source-map',
      'typescript',
    ],
  },
})
