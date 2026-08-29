# AGENTS.md — `@systemfsoftware/stryker-js-instrumenter`

> **Location:** `packages/testing/mutation/stryker-js/instrumenter/` — the instrumenter that places mutants and coverage hooks for every mutation run in this workspace.

This package is ours outright (`REPO-O1`). It began as a port of the StrykerJS instrumenter at 9.6.1, which is history and never governance: never contribute anything back, never preserve mergeability, and never describe that project as upstream of this one.

Deltas from root:

- **Parse/print substrate.** oxc parses js/ts/tsx (`src/Parser.ts`); an owned ESTree printer renders (`src/print/`), with the walker and node builders in `src/estree.ts`. There is no Babel in the graph and no `plugins` option on the instrumenter surface. Gate: `git grep -in babel -- src/ prints zero lines`.
- **Printer changes go through the corpus.** The round-trip net (`tests/print.property.test.ts`) re-parses every file in `tests/print-corpus/` and asserts zero errors. Extend the corpus when you teach the printer a new shape; a printer change with no corpus entry is unreviewed. Gate: `pnpm --filter @systemfsoftware/stryker-js-instrumenter test`.
- **Held to this repo's strictness.** `tsc --noEmit` and `oxlint` report zero. Where the type system cannot express an AST shape the placers construct by construction, the file-scoped oxlint disable carries its reason at the top of the file; keep disables scoped and the reasons true.
- **Placers validate their own fit.** Whether a replacement fits a position is the placer's claim, checked in its `canPlace`; do not restore a generic applied-node return.
- **No `stryker.config.json`** — mutation runs on authored pure decisions. Gate: the repo's mutation-config guard.

Gate: `pnpm --filter @systemfsoftware/stryker-js-instrumenter build typecheck lint attw` exits 0.
