import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesMap: Record<string, string> = {
  '.': './dist/index.d.ts',
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
  // The root entry is the whole public surface, and everything a consumer reaches is
  // re-exported from `index.ts`. Declaring `exports` here makes the build own the map, so
  // it cannot drift away from what the package actually emits.
  entry: ['src/index.ts'],
  format: 'esm',
  clean: true,
  // No `devExports` source condition here, unlike its siblings: this package's source
  // reaches TypeScript's internal API, which only its own `tsconfig.build.json` models.
  // Publishing a source condition makes every consumer compile these files and inherit
  // 122 errors about members that are absent from the public `typeof ts`. Consumers get
  // the emitted declarations, which is what they install.
  exports: { customExports: injectTypes },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      'typescript',
      '@loaderkit/resolve',
      '@systemfsoftware/npm-package',
      'cjs-module-lexer',
      'validate-npm-package-name',
    ],
  },
  noExternal: ['@std/semver'],
})
