import { defineConfig } from 'tsdown'

type ExportEntry = string | Record<string, string | undefined>

const injectTypes = (exports: Record<string, ExportEntry>): Record<string, ExportEntry> => {
  for (const [subpath, entry] of Object.entries(exports)) {
    if (subpath === './package.json') continue
    if (typeof entry === 'string') {
      exports[subpath] = { types: entry.replace(/\.mjs$/, '.d.mts'), default: entry }
    } else if (typeof entry === 'object') {
      const { default: defaultEntry, types: _existingTypes, ...rest } = entry
      if (typeof defaultEntry !== 'string') continue
      exports[subpath] = { ...rest, types: defaultEntry.replace(/\.mjs$/, '.d.mts'), default: defaultEntry }
    }
  }
  return exports
}

export default defineConfig({
  entry: {
    index: './src/index.ts',
    // A second entry, not a convenience: `Runner.ts` resolves this file as a
    // sibling of its own emitted module and copies it into the sandbox as vitest's setup
    // file. It must exist as a standalone artifact with no relative imports.
    'stryker-setup': './src/stryker-setup.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  // Stale chunks are published: `dist/` is what ships, and a chunk left from an
  // earlier build stays in the tarball. This package shipped a megabyte of
  // bundled test-runner internals that way, long after the code that pulled
  // them in was gone.
  clean: true,
  // In-source `if (import.meta.vitest)` blocks are test code. Defining the flag
  // away makes every such branch statically dead, so rolldown drops it along with
  // its dynamic `import('vitest')`. Without this the blocks ship, including those
  // bundled from a workspace dependency's sources.
  define: { 'import.meta.vitest': 'undefined' },
})
