import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  // Chunk filenames are content-hashed, so stale output is never overwritten:
  // `files: ["dist"]` then ships orphans importing undeclared specifiers.
  clean: true,
  // In-source `if (import.meta.vitest)` blocks are test code. Defining the flag
  // away makes every such branch statically dead, so rolldown drops it along with
  // its dynamic `import('vitest')`.
  define: { 'import.meta.vitest': 'undefined' },
})
