# AGENTS.md — `@systemfsoftware/stryker-js-core`

> **Location:** `packages/stryker-js/core/` — fork of `@stryker-mutator/core`. Universal agent rules live in the root `AGENTS.md`; this file carries only `stryker-js-core/`-specific deltas.

Fork preserving the Stryker API surface. Maintains subpath exports (`./checker-worker`, `./child-process-proxy-worker`, `./child-process-test-runner-worker`) for worker-entrypoint resolution. Rebuild with `pnpm build` after any forked-source change.

🛑 Don't refactor Stryker internals — only fork what needs patching. Keep diff minimal for upstream mergeability.
