# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

> **Location:** `packages/testing/mutation/stryker-js/vitest-runner/` — Vitest test-runner plugin for Stryker.

The tsconfig sets `strict: true` on the shared `@systemfsoftware/tsconfig/tsc/no-dom/library` base with the strictness toggles switched off, and the source carries no type-suppression comments and no non-null assertions.

Deltas from root:

- **No `stryker.config.json`** — this is a shell cell (an adapter over the vitest node API), so it decides nothing and must not be enrolled in mutation (root mutation rule — `check:mutate-scope`).
- **Browser mode is untested here.** The runner's browser support (the `screenshotFailures` suppression in `init()`) is kept but has no test; running the `testResources/simple-project/vitest.browser.config.js` fixture needs `@vitest/browser-playwright` (a devDependency) and a downloaded Chromium.
- **The sandbox directory is the project root.** The plugin is declared in `src/index.ts` via `declarePlugin('TestRunner', 'vitest', …)`, which unwraps `RunConfiguration` and `SandboxDirectory` from `@systemfsoftware/stryker-js/Plugin` and passes them into `makeVitestRunnerLayer`. In `init()` the sandbox directory is used as the project root instead of `process.cwd()` — it is passed to Vitest as `root`, the setup file and the project's own Vitest are resolved against it, and `options.vitest.dir` reaches Vitest only as the `dir` scan filter resolved against that root. `readSandboxSelfAliases` reads the sandbox copy's `package.json` `exports` under the `@systemfsoftware/source` condition and a `sandboxSelfPlugin` maps each specifier to the sandbox source path, so `related: true` follows a published package specifier to the sandbox copy while `node_modules` still resolves the published package. The `vitest` option section is declared by `VitestRunnerOptionsSchema` in `src/Runner.schema.ts`, and `src/index.ts` derives the `strykerValidationSchema` JSON Schema from that declaration — there is no `schema/` file.

🛑 `src/Runner.ts` resolves `stryker-setup.mjs` next to its own emitted module and copies it into the sandbox (as `stryker-setup-<pid>.js`, prepended to each project's setup files) — the invariant survives even though this package ships no in-package vitest suite: its in-tree integration coverage was deleted because it could only reach the runner through `src/`, so behavior is proven at composition altitude by the suites that consume runners (`pnpm turbo test`).

🛑 `src/stryker-setup.ts` must import nothing local — it is copied into the sandbox alone. That is why `collectTestName`/`toRawTestId` are duplicated there instead of imported from `src/Runner.ts`, where the rest of the test-identity logic lives.
