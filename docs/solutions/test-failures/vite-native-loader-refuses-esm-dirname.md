---
title: "Vite native config loader drops alias maps when CJS globals appear in ESM configs"
date: 2026-08-16
category: test-failures
module: effect-atom
problem_type: test_failure
component: testing_framework
symptoms:
  - "Browser-mode Vitest runs in CI fail with `TypeError: Failed to fetch dynamically imported module` for feature test files while Node-mode tests pass"
  - "Vite prints `Your Vite config uses features that are unsupported by configLoader: 'native' ... Use import.meta.dirname instead`"
  - "Local runs pass despite the warning, hiding the failure from non-CI environments"
root_cause: config_error
resolution_type: config_change
severity: medium
tags:
  - vitest
  - vite
  - esm
  - config-loader
  - browser-mode
  - playwright
  - effect-atom
---

# Vite native config loader drops alias maps when CJS globals appear in ESM configs

## Problem

When a Vitest configuration file in an ESM package relies on CommonJS globals like `__dirname` to define resolution aliases, Vite's native configuration loader (`configLoader: 'native'`) degrades silently. Instead of failing immediately with a fatal syntax error, the loader warns on stderr and drops the un-evaluable alias configuration.

In Node-based test runners, module resolution frequently succeeds via ambient resolution or parent-directory traversal, masking the dropped configuration. However, when running in browser mode (e.g. Chromium under Playwright), the browser worker requests source files directly over HTTP using package-specifier URLs. Without the alias map, the dev server cannot resolve workspace package imports inside the browser, causing dynamic import fetches to fail with `TypeError: Failed to fetch dynamically imported module`.

## Mechanism & Failure Modes

### 1. Silent Configuration Degradation in Native Loaders

Under native ESM loading, `__dirname` and `__filename` do not exist on the global scope. When Vite 4.1.10 encounters these symbols during native config evaluation:

- It records a non-fatal diagnostic warning on stderr.
- The evaluation of the containing object or property (such as `resolve.alias`) aborts or defaults to an empty object.
- The build or test runner continues execution with an incomplete configuration state rather than halting loudly at bootstrap.

### 2. Environment Disparity (Node vs Browser Test Runners)

Different Vitest test project runners consume the configuration with different levels of tolerance:

- **Node Environment:** Resolves imports through the Node module resolution graph. If dependencies are linked or hoisted in `node_modules`, test execution proceeds normally.
- **Browser Environment:** The browser execution context requires the Vite dev server to transform and serve all module requests. When the test runner requests `packages/effect-atom/atom-react/test/Hooks.feature.test.tsx`, the server encounters unresolved package specifiers that depended on `resolve.alias`. The browser receives an HTTP 500 or malformed bundle, manifesting as a browser-side fetch rejection.

## Solution

Replace all CommonJS directory references with the standard ECMAScript metadata property `import.meta.dirname` (available in Node 20.11+ and Node 22+).

In `packages/effect-atom/atom/vitest.config.ts` and `packages/effect-atom/atom-react/vitest.config.ts`:

```ts
// ❌ Problematic: CJS global inside ESM module causes native loader degradation
resolve: {
  alias: {
    '@systemfsoftware/effect-atom/test': path.join(__dirname, 'test'),
    '@systemfsoftware/effect-atom': path.join(__dirname, 'src'),
  },
}

// ✅ Correct: Standard ESM property natively supported by modern runtimes and Vite
resolve: {
  alias: {
    '@systemfsoftware/effect-atom/test': path.join(import.meta.dirname, 'test'),
    '@systemfsoftware/effect-atom': path.join(import.meta.dirname, 'src'),
  },
}
```

## Why This Works

`import.meta.dirname` is a built-in property of the module namespace in modern ECMAScript runtimes. Because it evaluates during the native module evaluation phase without accessing CommonJS execution context wrappers, the native configuration loader successfully evaluates the `resolve.alias` mapping.

When the browser test runner requests test files and internal package dependencies, the dev server's alias resolution pipeline finds the correct physical source paths on disk, transforms the TypeScript JSX modules on the fly, and serves them to the Chromium worker.

## Prevention & Detection

1. **Treat Config Loader Warnings as Hard Failures in CI:** Never dismiss `configLoader: 'native'` deprecation notices as cosmetic. A degraded configuration loader causes downstream failures that manifest layers away from the root cause.
2. **Standardize on `import.meta.dirname` across all Tooling:** In ESM workspaces (`"type": "module"`), audit all configuration files (`vitest.config.ts`, `tsdown.config.ts`, `oxlint.config.ts`) to ensure zero usage of `__dirname` or `__filename`.
3. **Static Check for CJS Globals in Tooling Configs:** Run an AST or lint check across workspace configuration files to forbid `Identifier[name='__dirname']`.

## Related Learnings

- `docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md` — shares the pattern where an environment-dependent silent failure masks the real root cause until exercised under CI conditions.
- `docs/plans/2026-08-16-001-fix-vitest-esm-dirname-plan.md` — planning document detailing the migration of the test configuration aliases.
