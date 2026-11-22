import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesPathOf = (defaultPath: string): string => defaultPath.replace(/\.mjs$/, '.d.ts')

const injectTypesEntry = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, entry] of Object.entries(exports)) {
    if (subpath === './package.json') continue
    if (typeof entry === 'string') {
      exports[subpath] = { types: typesPathOf(entry), default: entry }
    } else if (typeof entry === 'object') {
      const { default: defaultEntry, types: _existingTypes, ...rest } = entry
      if (typeof defaultEntry === 'string') {
        exports[subpath] = { ...rest, types: typesPathOf(defaultEntry), default: defaultEntry }
      }
    }
  }
  return exports
}

export default defineConfig({
  ...quietBuild,
  entry: {
    index: './src/index.ts',
    workspace: './src/WorkspacePackages.ts',
  },
  format: 'esm',
  dts: true,
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectTypesEntry,
  },
})
