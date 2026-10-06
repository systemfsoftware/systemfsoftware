import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { readdir } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const surfaces = await readdir(new URL('./src/surfaces/', import.meta.url), { withFileTypes: true })
  .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  .catch((): ReadonlyArray<string> => [])

const entry: Record<string, string> = {
  index: './src/mod.ts',
  ...Object.fromEntries(surfaces.map((surface) => [surface, `./src/surfaces/${surface}/mod.ts`])),
}

const typesMap: Record<string, string> = Object.fromEntries(
  Object.keys(entry).map((name) => [name === 'index' ? '.' : `./${name}`, `./dist/${name}.d.ts`]),
)

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(typesMap)) {
    const current = exports[subpath]
    if (typeof current === 'string') {
      exports[subpath] = { types, default: current }
    } else if (typeof current === 'object' && Boolean(current)) {
      const { default: defaultEntry, types: _existingTypes, ...rest } = current
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
  entry,
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
