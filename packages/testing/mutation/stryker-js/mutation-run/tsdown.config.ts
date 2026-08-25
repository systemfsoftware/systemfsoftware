import { defineConfig } from 'tsdown'

export default defineConfig({
  // Two doors, and neither is a random internal file. `index` is the whole
  // programmatic API - run the engine, read its config, observe its events and
  // verdict, classify its exit. `config/base` exists only because a
  // `stryker.config.json` names it by string in `extends`, which cannot travel
  // through the JS entry.
  //
  // The `internal/` entries are not an API: the engine spawns them by resolved
  // path, so they must be emitted and must resolve, but no one imports them for
  // a value and the prefix says so - the convention @effect/vitest ships as
  // `./internal/*`.
  entry: {
    index: './src/index.ts',
    'config/base': './src/config/base-preset.ts',
    'internal/checker-worker': './src/checker/checker-worker.ts',
    'internal/child-process-proxy-worker-main': './src/worker-pool/child-process-proxy-worker-main.ts',
    'internal/child-process-test-runner-worker': './src/test-runner/child-process-test-runner-worker.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  // Inlined, not externalized: see the note in ../typescript-checker/tsdown.config.ts.
  noExternal: ['@std/jsonc'],
  // Clean the dist before each build: with clean: false, content-hashed chunks
  // accumulate and a stale chunk (e.g. the pre-U6 reporters-*.mjs importing
  // chalk and progress) trips check:runtime-deps against a manifest that no
  // longer declares those deps.
  clean: true,
  // In-source `if (import.meta.vitest)` blocks are test code. Defining the
  // flag away makes every such branch statically dead, so rolldown drops it
  // along with its dynamic `import('vitest')`. Without this the blocks ship,
  // including those bundled from a workspace dependency's sources.
  define: { 'import.meta.vitest': 'undefined' },
})
