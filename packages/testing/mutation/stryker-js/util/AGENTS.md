# AGENTS.md — `@systemfsoftware/stryker-js-util`

> **Location:** `packages/testing/mutation/stryker-js/util/` — the helpers every package of the fork family imports. No runtime dependencies; Node builtins only.

Ported from the upstream StrykerJS util package at 9.6.1, ours outright (REPO-O1 — never contribute back, never preserve mergeability, never call it upstream).

Deltas from root:

- **Held to this repo's strictness, not upstream's.** `tsc --noEmit` and `oxlint` both report zero with the shared configs and no overrides. The ported sources therefore carry what that requires: `unknown` in place of `any`, an exhaustive `typeof` switch in `immutable.ts`, `Reflect.getPrototypeOf` in the unserializable scan, an overload pair instead of an unchecked assertion in `deepFreeze`, and an accumulator that is mutated rather than re-spread per key. "Upstream wrote it that way" is not a reason to restore any of it.
- **No `stryker.config.json`** — this package holds no authored decisions; its observers are the consumers' suites and `typecheck`.

Gate: `pnpm --filter @systemfsoftware/stryker-js-util build typecheck lint attw` exits 0.
