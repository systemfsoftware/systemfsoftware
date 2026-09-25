import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const typesOf: Record<string, string> = {
  '.': './dist/index.d.ts',
  './TestClock': './dist/TestClock.d.ts',
  './guard': './dist/guard.d.ts',
  './integration': './dist/integration.d.ts',
}

const withTypes = (entry: ExportEntry | undefined, types: string): ExportEntry | undefined => {
  if (typeof entry === 'string') return { types, default: entry }
  if (entry === undefined) return entry
  const { default: defaultEntry, types: _existingTypes, ...rest } = entry
  return { ...rest, types, default: defaultEntry }
}

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, types] of Object.entries(typesOf)) {
    const entry = withTypes(exports[subpath], types)
    if (entry !== undefined) exports[subpath] = entry
  }
  return exports
}

const compatReference = '/// <reference types="./compat.d.ts" />'

export default defineConfig({
  ...quietBuild,
  entry: {
    index: './src/mod.ts',
    TestClock: './src/TestClock.ts',
    guard: './src/guard.ts',
    integration: './src/integration.ts',
  },
  format: 'esm',
  dts: true,
  // The v3 `effect/TestClock` ambient is a script, so it cannot ride inside a bundled declaration file:
  // a `declare module` there would be an augmentation. The main type entry references the copied file.
  banner: ({ fileName }) => ({ dts: fileName === 'index.d.ts' ? compatReference : '' }),
  copy: [{ from: 'src/compat.d.ts', to: 'dist' }],
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { onlyBundle: false },
  define: { 'import.meta.vitest': 'undefined' },
})
