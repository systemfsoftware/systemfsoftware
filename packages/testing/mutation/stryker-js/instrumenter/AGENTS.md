# AGENTS.md — `@systemfsoftware/stryker-js-instrumenter`

> **Location:** `packages/testing/mutation/stryker-js/instrumenter/` — the Babel machinery that places mutants and coverage hooks for every mutation run in this workspace.

This package is ours outright (`REPO-O1`). It began as a port of the StrykerJS instrumenter at 9.6.1, which is history and never governance: never contribute anything back, never preserve mergeability, and never describe that project as upstream of this one.

Deltas from root:

- **Held to this repo's strictness, not the originating project's.** `tsconfig.json` extends the shared library config with no strictness overrides, and `oxlint.config.ts` extends the shared base: `tsc --noEmit` and `oxlint` both report zero. The originating contract was looser (`strict: true` and nothing else), so these sources carry the narrowings that gap requires — explicit invariant throws where the original asserted non-null, bracket access on index signatures, conditional spreads for optional properties, Babel predicates instead of assertions. Reverting any of that to match the original is not an argument.
- **Two structural additions, both forced by shipping a bundle rather than one emitted file per source:**
  - `src/babel/babel-generator.ts` — `@babel/generator` is CommonJS; a default import is the module object under Node's interop and the function itself under the bundler. Resolving both shapes once is the difference between working and `generator is not a function` at the first mutant.
  - `src/babel/babel-file.ts` — `@babel/core` exports `File` at runtime but `@types/babel__core` omits it. The declaration lives in an imported module, not an ambient `.d.ts`, so a consumer compiling this package from source (the `@systemfsoftware/source` condition, api-extractor with it) reaches it through the import graph. The wrapper is what makes `NodePath#buildCodeFrameError` render a code frame.
- **`applied()` returns a plain node.** Whether a replacement fits a position is the placer's claim, and each placer checks it with a Babel predicate. Do not restore a generic return: nothing at that point can check it.
- **No `stryker.config.json`** — mutation runs on authored pure decisions; this package carries ported Babel transforms.

Gate: `pnpm --filter @systemfsoftware/stryker-js-instrumenter build typecheck lint attw` exits 0.
