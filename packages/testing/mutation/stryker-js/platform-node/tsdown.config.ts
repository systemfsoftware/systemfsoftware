import { defineConfig } from 'tsdown'

export default defineConfig({
  // `index` is the package's one door. The `internal/` entries are not an API:
  // the engine spawns them as child processes, so each must stay its own
  // emitted chunk AND keep a resolvable subpath. Two call shapes depend on the
  // `internal/` prefix here and break silently without it - `Checker.ts` and
  // `TestRunner.ts` build `new URL('./internal/<name>.mjs', import.meta.url)`,
  // and `Worker.ts` calls `require.resolve` on the published
  // `./internal/child-process-proxy-worker-main` subpath. Excluding them from
  // `exports` makes that resolve throw, and the source fallback then hands Node
  // a `.ts` file it cannot execute, so the worker never connects.
  entry: {
    index: './src/index.ts',
    'internal/checker-worker': './src/Checker.worker.ts',
    'internal/child-process-proxy-worker-main': './src/WorkerMain.ts',
    'internal/child-process-test-runner-worker': './src/child-process-test-runner-worker.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  noExternal: ['@std/jsonc'],
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
