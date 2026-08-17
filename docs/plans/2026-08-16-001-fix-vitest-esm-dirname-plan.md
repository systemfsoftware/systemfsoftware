---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
plan_depth: lightweight
execution: code
date: 2026-08-16
---

# fix: replace `__dirname` with `import.meta.dirname` in two `vitest.config.ts` files

**Product Contract preservation:** no upstream Product Contract existed. Authored fresh with `product_contract_source: ce-plan-bootstrap`. Scope was confirmed by the invoking CI excerpt: `pnpm check:ci` running the tests task fails on `packages/effect-atom/atom-react/test/Hooks.feature.test.tsx` with `Failed to fetch dynamically imported module: …/test/Hooks.feature.test.tsx`, and the proximate cause is the `__dirname` reference in `packages/effect-atom/atom-react/vitest.config.ts:43` — vite 4.1.10 explicitly emits "Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite: `__dirname` (vitest.config.ts:43:54). Use `import.meta.dirname` instead." The same pattern exists in `packages/effect-atom/atom/vitest.config.ts:19`. Wiki cross-check returned no settled prior decision on this exact fix — `mcp__software_wiki_qmd_query` against `software-wiki` (617 docs) with lex/vec/hyde on `vitest config dirname ESM fix browser dynamic import` returned 0 hits at the fix shape; the two top candidates (`module-resolution-fires-first`, `annotation-derived-enforcement`) are tangential (exports maps and transform-chosen runtime checks, neither covers the vitest config loader).

---

## Goal Capsule

- **Objective:** both `vitest.config.ts` files stop using `__dirname`; `pnpm check:ci` exits 0 on the `test` task, the deprecation warning is gone, and the browser project loads the test file.
- **Authority:** the CI failure excerpt in the invoking chat, the vite warning text, and `node --eval 'console.log(import.meta.dirname)'` returning a real path on the local Node 22 (`repository.AGENTS.md` / `pnpm/packageManager`: `11.21.0`; `reusable-checks.yml` runs `ubuntu-latest`).
- **Stop conditions:** `pnpm --filter @systemfsoftware/effect-atom test` and `pnpm --filter @systemfsoftware/effect-atom-react test` both finish with no vite `__dirname` warning and the same passing test counts as before the change (locally 27 atom-react + 0 atom on 2026-08-16), and `pnpm check:local` exits 0 after the last edit.
- **Tail ownership:** ce-work implements U1 then U2; nothing here publishes to npm and no pure-core file changes, so no mutation gate runs.

---

## Product Contract

### Summary

The two `vitest.config.ts` files in `packages/effect-atom/` use `path.join(__dirname, …)` inside ESM modules. Both files declare `"type": "module"` transitively (the workspace root is `type: module`; `pnpm` packs hoist from there). Under vite 4.1.10's `configLoader: 'native'`, `__dirname` is not a property of the ESM module record, so the loader refuses the config — the visible symptom is the browser project's dynamic import of `test/Hooks.feature.test.tsx` failing because the alias map cannot resolve its source paths. The fix is one-line per file: replace `__dirname` with `import.meta.dirname` (ESM-native, Node 20.11+/22+).

### Problem Frame

- **Files affected (2):**
  - `packages/effect-atom/atom-react/vitest.config.ts` — lines 43–47, five aliases (`@systemfsoftware/effect-atom/test`, `@systemfsoftware/effect-atom`, `@systemfsoftware/effect-atom-react/test`, `@systemfsoftware/effect-atom-react`, `@systemfsoftware/effect-gherkin-spec`).
  - `packages/effect-atom/atom/vitest.config.ts` — lines 19–21, three aliases (`@systemfsoftware/effect-atom/test`, `@systemfsoftware/effect-atom`, `@systemfsoftware/effect-gherkin-spec`).
- **Reproducer:** `pnpm --filter @systemfsoftware/effect-atom-react test` runs locally and passes 27 tests with the deprecation warning printed three times (once per overlap of the shared config, the project config, and the browser config). No other `vitest.config.ts` in the workspace uses `__dirname` (verified via `grep -l '__dirname' packages/**/vitest.config.ts`: only the two files above).
- **Why the warning is now an error:** vite 4.1.10 enables `configLoader: 'native'` experimentally and emits the warning to flag unsupported patterns. The native loader evaluates the config file as ESM, where `__dirname` is `ReferenceError`; the loader falls back to the JS loader in a way that produces the dynamic-import failure for the test file rather than a hard error, so the failure appears intermittent across worker slots.
- **Why `import.meta.dirname` is safe:** Node 20.11 (Aug 2023) and Node 22 (Apr 2024) ship it; the reusable-checks workflow runs on `ubuntu-latest` (Node 22 family at present). Existing `sharedConfig` users (`packages/vitest-config/src`) and `tsdown.config.ts` files already use the same form in this repo (verified: `git log --oneline` shows `152923b2d3c refactor: use built-in 'import.meta.dirname|filename' shims`).
- **Why not `fileURLToPath(import.meta.url)`:** `import.meta.dirname` is the direct replacement and removes the `node:url` import; one fewer line per file.

### Requirements

- **R1.** `packages/effect-atom/atom-react/vitest.config.ts` uses `import.meta.dirname` in place of `__dirname` for every alias entry. Gate: `rg -n '__dirname' packages/effect-atom/atom-react/vitest.config.ts` returns no matches.
- **R2.** `packages/effect-atom/atom/vitest.config.ts` uses `import.meta.dirname` in place of `__dirname` for every alias entry. Gate: `rg -n '__dirname' packages/effect-atom/atom/vitest.config.ts` returns no matches.
- **R3.** The `path.join(__dirname, …)` shape is preserved; only the receiver changes. Gate: `rg -n 'path.join\\(import\\.meta\\.dirname' packages/effect-atom/atom/vitest.config.ts packages/effect-atom/atom-react/vitest.config.ts` returns 8 matches (3 + 5).
- **R4.** No `package.json#exports` and no `tsdown.config.ts` are touched. Gate: `git diff --stat -- packages/**/package.json 'packages/**/*.tsdown.config.ts'` returns empty.
- **R5.** `pnpm --filter @systemfsoftware/effect-atom test` exits 0 with no `__dirname` deprecation warning. Gate: same command, `rg -c 'configLoader: \.native.\)|__dirname.*Use .import.meta.dirname' <output>` returns 0.
- **R6.** `pnpm --filter @systemfsoftware/effect-atom-react test` exits 0 with no `__dirname` deprecation warning and the browser project loads `test/Hooks.feature.test.tsx`. Gate: same command, plus `rg -c 'Failed to fetch dynamically imported module' <output>` returns 0 and the test file shows 23 passing tests.
- **R7.** `pnpm check:local` exits 0. Gate: `gate:tasks` + `gate:dist` scripts (`package.json:18`) both exit 0.
- **R8.** A changeset is filed for both packages since they are publishable. Gate: `git diff --stat -- .changeset/` shows a new file with `patch` bump for `effect-atom` and `effect-atom-react`; the changeset-check workflow accepts it.

### Scope Boundaries

- **In scope:** two `vitest.config.ts` files (8 alias lines total), one `.changeset/fix-vitest-esm-dirname.md`.
- **Out of scope:** `packages/vitest-config/` (the shared config — it does not use `__dirname`; verified), other workspaces (`grep '__dirname' packages/**/vitest.config.ts` returns only the two files), `tsdown.config.ts` (separate realm, not the failing config), `package.json` exports (REPO-S4: hand edits forbidden; the change is not on this surface).
- **Out of scope:** broader ESM-migration sweep (turning `path` import into `node:path` imports, adding `node:url` etc). The single-liner is the local fix; scope creep is forbidden.
- **Out of scope:** adding a `configLoader: 'fuse'` or similar vite config flag to silence the warning. The native loader is the only instrument that fails; the fix is to make the config native-loadable, not to opt out.
- **Out of scope:** `eff-2026-08-09-001-fix-attw-cli-verification-merge-integration-plan.md` and other unrelated plans. This plan does not relitigate the `attw` CLI packaging; the `attw` wiring is one of the gates but the failure is a test failure, not an `attw` failure.

### Key Decisions

- **Replace `__dirname` with `import.meta.dirname` only.** No `fileURLToPath(import.meta.url)` indirection. (session-settled: user-directed — chosen over the `node:url` shape because `import.meta.dirname` is the direct ESM-native receiver; the existing `path.join` shape is preserved verbatim so risk is bounded.)
- **No `package.json` change.** The fix is a config-loader concern, not an exports concern. (session-settled: user-directed — chosen over adding a `tsdown.config.ts` shim because REPO-S4 forbids hand edits to exports and the change is not on that surface.)
- **No `node_modules` churn.** No new dependency; the receiver is a Node 20.11+ built-in. (session-settled: user-directed — chosen over `import-meta-dirname` or `pkg-dir` polyfills because the runner and the maintained Node baseline already ship it.)
- **One changeset covering both packages.** `packages/effect-atom/atom` and `packages/effect-atom/atom-react` are the two affected publishable packages; a single `.changeset/fix-vitest-esm-dirname.md` with two entries is the smallest release-record shape. (session-settled: user-directed — chosen over per-package changesets because the cause is one logical fix and the version bumps are independent inside the file.)

### Verification

- **Local unit (`packages/effect-atom/atom`):** `pnpm --filter @systemfsoftware/effect-atom test`. Expected: 0 tests, no `__dirname` warning, exit 0.
- **Local browser (`packages/effect-atom/atom-react`):** `pnpm --filter @systemfsoftware/effect-atom-react test`. Expected: 27 tests, 23 of which under `browser (chromium)`, no `__dirname` warning, no `Failed to fetch dynamically imported module`, exit 0.
- **Full gate:** `pnpm check:local`. Expected: `gate:tasks` + `gate:dist` exit 0.
- **Sanity check:** `rg -n '__dirname' packages/effect-atom/atom/vitest.config.ts packages/effect-atom/atom-react/vitest.config.ts` returns no matches.

### Wiki Query Trail

- **Query:** `searches=[{lex "vitest browser mode __dirname import.meta.dirname ESM config loader native"}, {vec "vitest config __dirname native loader warning dynamic import failure effect-atom playwright chromium"}, {hyde "vitest.config.ts uses __dirname in ESM, the native config loader refuses it, dynamic import of test file fails in browser mode"}]`, `intent: find any settled prior decision on replacing __dirname with import.meta.dirname in vitest configs, or any recorded CI failure pattern for effect-atom browser tests`.
- **Corpus:** `software-wiki` (617 docs).
- **Result:** 0 hits at the fix shape. Top-2 candidates (`module-resolution-fires-first`, `annotation-derived-enforcement`) are tangential (exports maps and transformer-chosen runtime checks). Nil result recorded for the next reader to falsify.
