import { defineConfig } from 'tsdown'

export default defineConfig({
  // One entry per upstream subpath export (`./check ./core ./ignore ./logging ./plugin
  // ./report ./test-runner`). Each entry key ends in `/index` so the emitted module lands at
  // `dist/<subpath>/index.mjs` — two levels below the package root. That is load-bearing:
  // the vendored `src/core/stryker-options-schema.ts` reads `../../schema/stryker-core.json`
  // relative to its own emitted module at runtime, and only a two-level nest resolves that to
  // `schema/` at the package root (the same convention the sibling forks use, `../schema/`
  // from a flat `dist/` entry). Flattening an entry breaks the `core` subpath at runtime.
  entry: {
    'check/index': './src/check/index.ts',
    'core/index': './src/core/index.ts',
    'ignore/index': './src/ignore/index.ts',
    'logging/index': './src/logging/index.ts',
    'plugin/index': './src/plugin/index.ts',
    'report/index': './src/report/index.ts',
    'test-runner/index': './src/test-runner/index.ts',
  },
  format: 'esm',
  dts: true,
  // The deliberate exception to the repo-wide `devExports: '@systemfsoftware/source'`: this
  // `src/` is vendored at upstream's looser strictness, so advertising the source condition
  // pulls it into a stricter consumer's program — `stryker-plugins` did that and got 43
  // errors. Consumers get the built `.d.ts`. Same ruling as `../cli/tsconfig.json`.
  exports: { devExports: false },
  clean: false,
})
