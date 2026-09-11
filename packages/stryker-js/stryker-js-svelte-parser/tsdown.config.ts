import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
  },
  format: 'esm',
  dts: true,
  exports: true,
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
