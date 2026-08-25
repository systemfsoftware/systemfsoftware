import { defineConfig } from 'tsdown'

export default defineConfig({
  // One entry per upstream subpath export (`./check ./core ./ignore ./logging ./plugin
  // ./report ./test-runner`). Each entry key ends in `/index` so the emitted module lands at
  // `dist/<subpath>/index.mjs` — matching the `./core` → `./dist/core/index.mjs` exports map
  // in package.json (the same `dist/<subpath>/index.mjs` convention the sibling forks use).
  // The option set is now `src/core/stryker-options.schema.ts`, which derives its JSON Schema
  // document at build time — no `schema/` directory or runtime file read exists anymore, so
  // nothing else depends on the nesting depth.
  entry: {
    'check/index': './src/check/index.ts',
    'core/index': './src/core/index.ts',
    'evaluate/index': './src/evaluate/index.ts',
    'ignore/index': './src/ignore/index.ts',
    'logging/index': './src/logging/index.ts',
    'plugin/index': './src/plugin/index.ts',
    'report/index': './src/report/index.ts',
    'test-runner/index': './src/test-runner/index.ts',
  },
  format: 'esm',
  dts: true,
  // The deliberate exception to the repo-wide `devExports: '@systemfsoftware/source'`: this
  // `src/` is held at a looser strictness than the rest of the workspace, so advertising the
  // source condition pulls it into a stricter consumer's program — `stryker-plugins` did that
  // and got 43 errors. Consumers get the built `.d.ts`. Same ruling as `../cli/tsconfig.json`.
  exports: { devExports: false },
  // Stale chunks are published: `dist/` is what ships, and a chunk left from an
  // earlier build stays in the tarball. This package shipped a megabyte of
  // bundled test-runner internals that way, long after the code that pulled
  // them in was gone.
  clean: true,
  // In-source `if (import.meta.vitest)` blocks are test code. Defining the flag
  // away makes every such branch statically dead, so rolldown drops it along
  // with its dynamic `import('vitest')`. Without this they ship — and because
  // this package's sources are bundled into every dependent, they ship there too.
  define: { 'import.meta.vitest': 'undefined' },
})
