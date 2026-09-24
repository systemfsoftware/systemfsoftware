import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const apiExtractorRollups: Record<string, string> = {
  '.': './dist/effect-daemon-spec.d.ts',
  './testing': './dist/lock-primitive-conformance.d.ts',
}

const TESTING_ENTRY = './lock-primitive-conformance'
const TESTING_SUBPATH = './testing'

const injectApiExtractorTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  const testingEntry = exports[TESTING_ENTRY]
  if (testingEntry !== undefined) {
    exports[TESTING_SUBPATH] = testingEntry
    delete exports[TESTING_ENTRY]
  }
  for (const [subpath, types] of Object.entries(apiExtractorRollups)) {
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
  clean: false,
  entry: {
    index: './src/mod.ts',
    'lock-primitive-conformance': './src/testing/LockPrimitiveConformance.ts',
  },
  exports: {
    devExports: '@systemfsoftware/source',
    customExports: injectApiExtractorTypes,
  },
  deps: {
    onlyBundle: false,
  },
  format: 'esm',
  dts: true,
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  define: { 'import.meta.vitest': 'undefined' },
})
